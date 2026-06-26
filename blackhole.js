// Google Gemini

// ============================================================================
//  ZENITH SKY ASTROPHYSICS ENGINE — GARGANTUA CINEMATIC MODEL
//  Real-Time Cartesian GPU Schwarzschild Ray Tracer
// ============================================================================

export class GPUSchwarzschildEngine {
    constructor(canvasId, container) {
        this.canvas = document.getElementById(canvasId);
        this.container = container;
        
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

        // HOLLYWOOD CINEMATIC PARAMETERS (Gargantua Tuning)
        this.settings = {
            camDist: 38.0,
            camTiltDeg: 0.5,             // Edge-on view compresses the disk into a thin central line
            fov: 48.0 * Math.PI / 180.0, // Framed perfectly within the container viewport
            R_s: 1.0,
            R_in: 2.6,                   // Pulled closer to the ultra-bright photon sphere
            R_out: 16.0
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

            #define MAX_STEPS 300
            #define DL 0.15

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

            // Flawless Cartesian derivative evaluation. No coordinate singularities!
            void getDerivs(vec3 pos, vec3 vel, out vec3 dPos, out vec3 dVel, float M) {
                dPos = vel;
                float r2 = dot(pos, pos);
                float r = sqrt(r2);
                
                vec3 crossProd = cross(pos, vel);
                float L2 = dot(crossProd, crossProd);
                
                dVel = (-3.0 * M * L2 / (r2 * r2 * r)) * pos;
            }

            void main() {
                float aspect = u_resolution.x / u_resolution.y;
                float tanHalfFov = tan(u_fov / 2.0);
                vec2 uv = (vUv * 2.0 - 1.0);
                float u = uv.x * aspect * tanHalfFov;
                float v = uv.y * tanHalfFov;

                // Setup Cartesian Coordinate Frames
                vec3 camPos = vec3(0.0, u_camDist * sin(u_camTilt), u_camDist * cos(u_camTilt));
                vec3 forward = normalize3(-camPos);
                vec3 upWorld = vec3(0.0, 1.0, 0.0);
                vec3 right = normalize3(cross(forward, upWorld));
                vec3 up = normalize3(cross(right, forward));

                vec3 dirCam = normalize3(vec3(u, v, 1.0));
                vec3 cur_vel = normalize3(dirCam.x * right + dirCam.y * up + dirCam.z * forward);
                vec3 cur_pos = camPos;

                vec3 finalColor = vec3(0.001, 0.001, 0.003); // Deep spatial baseline void
                float M = R_s / 2.0;

                for (int n = 0; n < MAX_STEPS; n++) {
                    float r2 = dot(cur_pos, cur_pos);
                    float r = sqrt(r2);

                    if (r < R_s * 1.001) {
                        finalColor = vec3(0.0); // Event Horizon Shadow Capture
                        break;
                    }
                    if (r > 60.0 * R_s) break;

                    // Stable Cartesian RK4 Solver
                    vec3 dp1, dv1;
                    getDerivs(cur_pos, cur_vel, dp1, dv1, M);

                    vec3 p2 = cur_pos + dp1 * (DL * 0.5);
                    vec3 v2 = cur_vel + dv1 * (DL * 0.5);
                    vec3 dp2, dv2;
                    getDerivs(p2, v2, dp2, dv2, M);

                    vec3 p3 = cur_pos + dp2 * (DL * 0.5);
                    vec3 v3 = cur_vel + dv2 * (DL * 0.5);
                    vec3 dp3, dv3;
                    getDerivs(p3, v3, dp3, dv3, M);

                    vec3 p4 = cur_pos + dp3 * DL;
                    vec3 v4 = cur_vel + dv3 * DL;
                    vec3 dp4, dv4;
                    getDerivs(p4, v4, dp4, dv4, M);

                    float prev_y = cur_pos.y;

                    cur_pos += (dp1 + 2.0 * dp2 + 2.0 * dp3 + dp4) * (DL / 6.0);
                    cur_vel += (dv1 + 2.0 * dv2 + 2.0 * dv3 + dv4) * (DL / 6.0);

                    // BULLETPROOF FLAT ACCRETION EQUATOR CROSSING CHECK
                    if (prev_y * cur_pos.y <= 0.0) {
                        float t = abs(prev_y) / (abs(prev_y) + abs(cur_pos.y));
                        vec3 intersectPos = mix(cur_pos - cur_vel * DL, cur_pos, t);
                        float hit_r = length(intersectPos);

                        if (hit_r >= R_in && hit_r <= R_out) {
                            float vphi = sqrt(R_s / (2.0 * hit_r));
                            
                            float phi = atan(intersectPos.z, intersectPos.x);
                            vec3 tangent = normalize3(vec3(-sin(phi), 0.0, cos(phi)));
                            vec3 los = normalize3(camPos - intersectPos);

                            float cosA = dot(tangent, los);
                            float doppler = 1.0 / (sqrt(1.0 - vphi * vphi) * (1.0 - vphi * cosA));
                            float grav = sqrt(1.0 - R_s / hit_r);

                            // CINEMATIC TUNING: Blend dynamic Doppler beaming down to 15% to match Interstellar's balanced visual art choice
                            float cinematicDoppler = mix(1.0, doppler, 0.15);
                            
                            // High-frequency hot plasma gas waves
                            float noiseFactor = 0.86 + 0.14 * sin(phi * 9.0 - u_time * 2.8) * cos(hit_r * 1.8);
                            float T = (6300.0 * pow(R_in / hit_r, 0.65) * noiseFactor) * cinematicDoppler * grav;

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
//  UNIFIED DOM EVENT CONTROLLER (MATCHES YOUR EXACT HTML ELEMENTS)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('blackhole-open');
    const closeBtn = document.getElementById('blackhole-close');
    const modalOverlay = document.getElementById('blackhole-modal-overlay');
    const canvasContainer = document.getElementById('blackhole-canvas')?.parentElement;

    let bhEngine = null;

    if (openBtn && modalOverlay && canvasContainer) {
        openBtn.onclick = function () {
            modalOverlay.style.display = 'flex';

            // 50ms layout paint buffer window
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
            if (bhEngine) {
                bhEngine.destroy();
                bhEngine = null;
            }
            modalOverlay.style.display = 'none';
        };
    }

    window.addEventListener('resize', () => {
        if (bhEngine) bhEngine.resize();
    });
});
