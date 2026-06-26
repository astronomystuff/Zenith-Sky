// Google Gemini vs Microsoft Copilot Black Hole

// ============================================================================
//  ZENITH SKY ASTROPHYSICS ENGINE — DOM MODULE INTEGRATION (EXTERNAL THREE)
// ============================================================================

export class GPUSchwarzschildEngine {
    constructor(canvasId, container) {
        this.canvas = document.getElementById(canvasId);
        this.container = container;
        
        this.width = this.container.clientWidth || window.innerWidth * 0.8; 
        this.height = this.container.clientHeight || window.innerHeight * 0.8;

        // Uses the existing global THREE namespace from your app environment
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas,
            antialias: false, 
            powerPreference: "high-performance" 
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.clock = new THREE.Clock();
        
        this.material = null;
        this.mesh = null;
        this.frameId = null;

        this.settings = {
            camDist: 40.0,
            camTiltDeg: 22.0,
            fov: 40.0 * Math.PI / 180.0,
            R_s: 1.0,
            R_in: 3.0,
            R_out: 15.0
        };

        this.buildShaderMesh();
    }

    buildShaderMesh() {
        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform float u_camDist;
            uniform float u_camTilt;
            uniform float u_fov;
            uniform float R_s;
            uniform float R_in;
            uniform float R_out;
            varying vec2 vUv;

            #define MAX_STEPS 350
            #define DL 0.22

            vec3 normalize3(vec3 v) { return length(v) == 0.0 ? vec3(0.0) : normalize(v); }

            vec3 blackbody(float T) {
                T = clamp(T, 1200.0, 11000.0);
                float t = (T - 1200.0) / (11000.0 - 1200.0);
                vec3 col;
                col.r = 165.0 + 90.0 * t;
                col.g = 40.0 + 215.0 * pow(t, 1.05);
                col.b = 10.0 + 155.0 * pow(t, 2.0);
                return vec3(pow(clamp(col.r/255.0, 0.0, 1.0), 0.88),
                            pow(clamp(col.g/255.0, 0.0, 1.0), 0.88),
                            pow(clamp(col.b/255.0, 0.0, 1.0), 0.88));
            }

            void main() {
                float aspect = u_resolution.x / u_resolution.y;
                float tanHalfFov = tan(u_fov / 2.0);
                vec2 uv = (vUv * 2.0 - 1.0);
                float u = uv.x * aspect * tanHalfFov;
                float v = uv.y * tanHalfFov;

                vec3 camPos = vec3(0.0, u_camDist * sin(u_camTilt), u_camDist * cos(u_camTilt));
                vec3 forward = normalize3(-camPos);
                vec3 upWorld = vec3(0.0, 1.0, 0.0);
                vec3 right = normalize3(cross(forward, upWorld));
                vec3 up = normalize3(cross(right, forward));

                vec3 dirCam = normalize3(vec3(u, v, 1.0));
                vec3 dir = normalize3(dirCam.x * right + dirCam.y * up + dirCam.z * forward);

                float r = length(camPos);
                float th = acos(camPos.y / r);
                float ph = atan(camPos.z, camPos.x);

                vec3 er = camPos / r;
                vec3 eTh = vec3(cos(th)*cos(ph), -sin(th), cos(th)*sin(ph));
                vec3 ePh = vec3(-sin(ph), 0.0, cos(ph));

                float pr = dot(dir, er);
                float ptheta = r * dot(dir, eTh);
                float pphi = r * sin(th) * dot(dir, ePh);

                float cur_r = r; float cur_th = th; float cur_ph = ph;
                float cur_pr = pr; float cur_pth = ptheta; float cur_pphi = pphi;

                vec3 finalColor = vec3(0.005, 0.005, 0.012); 
                float M = R_s / 2.0;

                for (int n = 0; n < MAX_STEPS; n++) {
                    float f1 = 1.0 - (2.0 * M) / cur_r; if (f1 <= 0.0) f1 = 1e-5;
                    float sinTh1 = sin(cur_th); if (abs(sinTh1) < 1e-4) sinTh1 = 1e-4;

                    float dr1 = cur_pr;
                    float dth1 = cur_pth / (cur_r * cur_r);
                    float dph1 = cur_pphi / (cur_r * cur_r * sinTh1 * sinTh1);
                    float dpr1 = (cur_pphi * cur_pphi) / (cur_r * cur_r * cur_r * sinTh1 * sinTh1) - (M / (cur_r * cur_r)) * ((cur_pr * cur_pr) / f1);
                    float dpth1 = (cur_pphi * cur_pphi) * cos(cur_th) / (cur_r * cur_r * cur_r * sinTh1 * sinTh1 * sinTh1);

                    float r_k2 = cur_r + dr1 * (DL * 0.5);
                    float th_k2 = cur_th + dth1 * (DL * 0.5);
                    float pr_k2 = cur_pr + dpr1 * (DL * 0.5);
                    float pth_k2 = cur_pth + dpth1 * (DL * 0.5);

                    float f2 = 1.0 - (2.0 * M) / r_k2; if (f2 <= 0.0) f2 = 1e-5;
                    float sinTh2 = sin(th_k2); if (abs(sinTh2) < 1e-4) sinTh2 = 1e-4;

                    float dr2 = pr_k2;
                    float dth2 = pth_k2 / (r_k2 * r_k2);
                    float dph2 = cur_pphi / (r_k2 * r_k2 * sinTh2 * sinTh2);
                    float dpr2 = (cur_pphi * cur_pphi) / (r_k2 * r_k2 * r_k2 * sinTh2 * sinTh2) - (M / (r_k2 * r_k2)) * ((pr_k2 * pr_k2) / f2);
                    float dpth2 = (cur_pphi * cur_pphi) * cos(th_k2) / (r_k2 * r_k2 * r_k2 * sinTh2 * sinTh2 * sinTh2);

                    cur_r += dr2 * DL; cur_th += dth2 * DL; cur_ph += dph2 * DL;
                    cur_pr += dpr2 * DL; cur_pth += dpth2 * DL;

                    if (cur_r < R_s * 1.002) {
                        finalColor = vec3(0.0, 0.0, 0.0);
                        break;
                    }
                    if (cur_r > 48.0 * R_s) break;

                    if (abs(cur_th - 3.14159265 / 2.0) < 0.022) {
                        if (cur_r >= R_in && cur_r <= R_out) {
                            vec3 diskPos = vec3(cur_r * sin(cur_th) * cos(cur_ph), cur_r * cos(cur_th), cur_r * sin(cur_th) * sin(cur_ph));
                            float vphi = sqrt(R_s / (2.0 * cur_r));
                            vec3 tangent = normalize3(vec3(-sin(cur_ph), 0.0, cos(cur_ph)));
                            vec3 los = normalize3(camPos - diskPos);

                            float cosA = dot(tangent, los);
                            float doppler = 1.0 / (sqrt(1.0 - vphi * vphi) * (1.0 - vphi * cosA));
                            float grav = sqrt(1.0 - R_s / cur_r);

                            float noiseFactor = 0.88 + 0.12 * sin(cur_ph * 7.0 - u_time * 2.5);
                            float T = (6600.0 * pow(R_in / cur_r, 0.75) * noiseFactor) * doppler * grav;

                            finalColor = blackbody(T);
                            break;
                        }
                    }
                }
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                u_resolution: { value: new THREE.Vector2(this.width, this.height) },
                u_time: { value: 0 },
                u_camDist: { value: this.settings.camDist },
                u_camTilt: { value: this.settings.camTiltDeg * Math.PI / 180.0 },
                u_fov: { value: this.settings.fov },
                R_s: { value: this.settings.R_s },
                R_in: { value: this.settings.R_in },
                R_out: { value: this.settings.R_out }
            }
        });

        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(this.mesh);
    }

    animate() {
        this.clock.start();
        const render = () => {
            this.material.uniforms.u_time.value = this.clock.getElapsedTime();
            this.renderer.render(this.scene, this.camera);
            this.frameId = requestAnimationFrame(render);
        };
        render();
    }

    resize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.renderer.setSize(this.width, this.height);
        this.material.uniforms.u_resolution.value.set(this.width, this.height);
    }

    destroy() {
        if (this.frameId) cancelAnimationFrame(this.frameId);
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.material.dispose();
        this.renderer.dispose();
    }
}

// ============================================================================
//  DOM EVENT CONTROLLER
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('blackhole-open');
    const closeBtn = document.getElementById('bh-close');
    const modal = document.getElementById('bh-modal');
    const modalContent = modal?.querySelector('.modal-content');

    let bhEngine = null;

    if (openBtn && modal && modalContent) {
        openBtn.addEventListener('click', () => {
            modal.classList.add('active'); 
            modal.style.display = 'flex';

            setTimeout(() => {
                bhEngine = new GPUSchwarzschildEngine('bh-canvas', modalContent);
                bhEngine.animate();
            }, 50); 
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            if (bhEngine) {
                bhEngine.destroy();
                bhEngine = null;
            }
            modal.style.display = 'none';
            modal.classList.remove('active');
        });
    }

    window.addEventListener('resize', () => {
        if (bhEngine) bhEngine.resize();
    });
});
