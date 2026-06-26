// Google Gemini vs Microsoft Copilot Black Hole

// ============================================================================
//  ZENITH SKY ASTROPHYSICS ENGINE — FIXED DOM MODULE INTEGRATION
// ============================================================================

export class GPUSchwarzschildEngine {
    constructor(canvasId, container) {
        this.canvas = document.getElementById(canvasId);
        this.container = container;
        
        // Dynamically measure the parent container bounding space
        this.width = this.container.clientWidth || window.innerWidth * 0.95; 
        this.height = this.container.clientHeight || window.innerHeight * 0.95;

        // Core WebGL Engine Setup
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

            #define MAX_STEPS 400
            #define DL 0.12

            vec3 normalize3(vec3 v) { return length(v) == 0.0 ? vec3(0.0) : normalize(v); }

            vec3 blackbody(float T) {
                T = clamp(T, 1000.0, 12000.0);
                float t = (T - 1000.0) / (12000.0 - 1000.0);
                vec3 col;
                col.r = 165.0 + 90.0 * t;
                col.g = 45.0 + 210.0 * pow(t, 1.1);
                col.b = 10.0 + 165.0 * pow(t, 2.0);
                return vec3(pow(clamp(col.r/255.0, 0.0, 1.0), 0.85),
                            pow(clamp(col.g/255.0, 0.0, 1.0), 0.85),
                            pow(clamp(col.b/255.0, 0.0, 1.0), 0.85));
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
                float th = acos(clamp(camPos.y / r, -0.9999, 0.9999));
                float ph = atan(camPos.z, camPos.x);

                vec3 er = camPos / r;
                vec3 eTh = vec3(cos(th)*cos(ph), -sin(th), cos(th)*sin(ph));
                vec3 ePh = vec3(-sin(ph), 0.0, cos(ph));

                float pr = dot(dir, er);
                float ptheta = r * dot(dir, eTh);
                float pphi = r * sin(th) * dot(dir, ePh);

                float cur_r = r; float cur_th = th; float cur_ph = ph;
                float cur_pr = pr; float cur_pth = ptheta; float cur_pphi = pphi;

                vec3 finalColor = vec3(0.002, 0.002, 0.005); 
                float M = R_s / 2.0;

                for (int n = 0; n < MAX_STEPS; n++) {
                    if (cur_r < R_s * 1.0005) {
                        finalColor = vec3(0.0);
                        break;
                    }
                    if (cur_r > 55.0 * R_s) break;

                    float f1 = 1.0 - (2.0 * M) / cur_r;
                    float sinTh1 = sin(cur_th);
                    if (abs(sinTh1) < 1e-3) sinTh1 = 1e-3;

                    float dr1 = cur_pr;
                    float dth1 = cur_pth / (cur_r * cur_r);
                    float dph1 = cur_pphi / (cur_r * cur_r * sinTh1 * sinTh1);
                    float dpr1 = (cur_pphi * cur_pphi) / (cur_r * cur_r * cur_r * sinTh1 * sinTh1) - (M / (cur_r * cur_r)) * ((cur_pr * cur_pr) / max(f1, 1e-4));
                    float dpth1 = (cur_pphi * cur_pphi) * cos(cur_th) / (cur_r * cur_r * cur_r * sinTh1 * sinTh1 * sinTh1);

                    float r_k2 = cur_r + dr1 * (DL * 0.5);
                    float th_k2 = clamp(cur_th + dth1 * (DL * 0.5), 1e-3, 3.1411);
                    float pr_k2 = cur_pr + dpr1 * (DL * 0.5);
                    float pth_k2 = cur_pth + dpth1 * (DL * 0.5);

                    float f2 = 1.0 - (2.0 * M) / r_k2;
                    float sinTh2 = sin(th_k2);
                    if (abs(sinTh2) < 1e-3) sinTh2 = 1e-3;

                    float dr2 = pr_k2;
                    float dth2 = pth_k2 / (r_k2 * r_k2);
                    float dph2 = cur_pphi / (r_k2 * r_k2 * sinTh2 * sinTh2);
                    float dpr2 = (cur_pphi * cur_pphi) / (r_k2 * r_k2 * r_k2 * sinTh2 * sinTh2) - (M / (r_k2 * r_k2)) * ((pr_k2 * pr_k2) / max(f2, 1e-4));
                    float dpth2 = (cur_pphi * cur_pphi) * cos(th_k2) / (r_k2 * r_k2 * r_k2 * sinTh2 * sinTh2 * sinTh2);

                    float prev_cos = cos(cur_th);
                    
                    cur_r += dr2 * DL; 
                    cur_th = clamp(cur_th + dth2 * DL, 1e-3, 3.1411); 
                    cur_ph += dph2 * DL;
                    cur_pr += dpr2 * DL; 
                    cur_pth += dpth2 * DL;

                    if (prev_cos * cos(cur_th) <= 0.0) {
                        if (cur_r >= R_in && cur_r <= R_out) {
                            vec3 diskPos = vec3(cur_r * sin(cur_th) * cos(cur_ph), cur_r * cos(cur_th), cur_r * sin(cur_th) * sin(cur_ph));
                            float vphi = sqrt(R_s / (2.0 * cur_r));
                            vec3 tangent = normalize3(vec3(-sin(cur_ph), 0.0, cos(cur_ph)));
                            vec3 los = normalize3(camPos - diskPos);

                            float cosA = dot(tangent, los);
                            float doppler = 1.0 / (sqrt(1.0 - vphi * vphi) * (1.0 - vphi * cosA));
                            float grav = sqrt(1.0 - R_s / cur_r);

                            float noiseFactor = 0.85 + 0.15 * sin(cur_ph * 8.0 - u_time * 3.0) * cos(cur_r * 1.5);
                            float T = (6800.0 * pow(R_in / cur_r, 0.75) * noiseFactor) * doppler * grav;

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
//  UNIFIED DOM EVENT CONTROLLER (MATCHES YOUR EXACT HTML)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('blackhole-open');
    const closeBtn = document.getElementById('blackhole-close');
    const modalOverlay = document.getElementById('blackhole-modal-overlay');
    
    // We target the canvas parent div directly to read responsive viewport measurements
    const canvasContainer = document.getElementById('blackhole-canvas')?.parentElement;

    let bhEngine = null;

    if (openBtn && modalOverlay && canvasContainer) {
        openBtn.onclick = function () {
            // 1. Show the overlay layout structure
            modalOverlay.style.display = 'flex';

            // 2. Allow a 50ms buffer for layout calculations before compiling shaders
            setTimeout(() => {
                if (!bhEngine) {
                    bhEngine = new GPUSchwarzschildEngine('blackhole-canvas', canvasContainer);
                    bhEngine.animate();
                }
            }, 50);
        };
    }

    if (closeBtn && modalOverlay) {
        closeBtn.onclick = function () {
            // 1. Fully unload simulation resources from VRAM immediately
            if (bhEngine) {
                bhEngine.destroy();
                bhEngine = null;
            }
            // 2. Close the modal frame view
            modalOverlay.style.display = 'none';
        };
    }

    window.addEventListener('resize', () => {
        if (bhEngine) bhEngine.resize();
    });
});
