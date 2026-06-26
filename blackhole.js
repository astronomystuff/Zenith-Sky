// Google Gemini

// ============================================================================
//  ZENITH SKY ASTROPHYSICS ENGINE — INTERACTIVE BOLD GLOW EDITION
// ============================================================================

export class GPUSchwarzschildEngine {
    constructor(canvasId, container) {
        this.canvas = document.getElementById(canvasId);
        this.container = container;
        
        this.width = this.container.clientWidth || window.innerWidth * 0.95; 
        this.height = this.container.clientHeight || window.innerHeight * 0.95;

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

        // Interaction States
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        
        // Initializing camera values slightly offset from 0 to capture the disk line perfectly
        this.settings = {
            camDist: 38.0,
            camTilt: (90.0 - 0.5) * Math.PI / 180.0, // Converted to standard spherical polar angle
            camPan: 0.0,                              // Left/Right rotation angle
            fov: 48.0 * Math.PI / 180.0,
            R_s: 1.0,
            R_in: 2.5,
            R_out: 15.0
        };

        this.buildShaderMesh();
        this.setupInteraction();
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
            uniform float u_camPan;
            uniform float u_fov;
            uniform float R_s;
            uniform float R_in;
            uniform float R_out;
            varying vec2 vUv;

            #define MAX_STEPS 300
            #define DL 0.15

            vec3 normalize3(vec3 v) { return length(v) == 0.0 ? vec3(0.0) : normalize(v); }

            // High-intensity color core with dynamic overexposure processing
            vec3 blackbody(float T) {
                T = clamp(T, 1000.0, 16000.0);
                float t = (T - 1000.0) / (16000.0 - 1000.0);
                vec3 col;
                col.r = 170.0 + 85.0 * t;
                col.g = 40.0 + 215.0 * pow(t, 1.05);
                col.b = 10.0 + 245.0 * pow(t, 1.8);
                
                vec3 rgb = vec3(pow(clamp(col.r/255.0, 0.0, 1.0), 0.85),
                                pow(clamp(col.g/255.0, 0.0, 1.0), 0.85),
                                pow(clamp(col.b/255.0, 0.0, 1.0), 0.85));
                                
                // Blinding Exposure amplification: Overdrive bright values directly into white light regions
                if (T > 8500.0) {
                    rgb += vec3(pow((T - 8500.0) / 7500.0, 1.2) * 0.7);
                }
                return rgb;
            }

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

                // Full 3D Spherical Coordinate mapping for completely free orbital camera paths
                vec3 camPos = vec3(
                    u_camDist * sin(u_camTilt) * cos(u_camPan),
                    u_camDist * cos(u_camTilt),
                    u_camDist * sin(u_camTilt) * sin(u_camPan)
                );

                vec3 forward = normalize3(-camPos);
                vec3 upWorld = vec3(0.0, 1.0, 0.0);
                vec3 right = normalize3(cross(forward, upWorld));
                vec3 up = normalize3(cross(right, forward));

                vec3 dirCam = normalize3(vec3(u, v, 1.0));
                vec3 cur_vel = normalize3(dirCam.x * right + dirCam.y * up + dirCam.z * forward);
                vec3 cur_pos = camPos;

                vec3 finalColor = vec3(0.001, 0.001, 0.003); 
                float M = R_s / 2.0;

                for (int n = 0; n < MAX_STEPS; n++) {
                    float r2 = dot(cur_pos, cur_pos);
                    float r = sqrt(r2);

                    if (r < R_s * 1.001) {
                        finalColor = vec3(0.0);
                        break;
                    }
                    if (r > 60.0 * R_s) break;

                    vec3 dp1, dv1; getDerivs(cur_pos, cur_vel, dp1, dv1, M);
                    vec3 p2 = cur_pos + dp1 * (DL * 0.5); vec3 v2 = cur_vel + dv1 * (DL * 0.5);
                    vec3 dp2, dv2; getDerivs(p2, v2, dp2, dv2, M);
                    vec3 p3 = cur_pos + dp2 * (DL * 0.5); vec3 v3 = cur_vel + dv2 * (DL * 0.5);
                    vec3 dp3, dv3; getDerivs(p3, v3, dp3, dv3, M);
                    vec3 p4 = cur_pos + dp3 * DL; vec3 v4 = cur_vel + dv3 * DL;
                    vec3 dp4, dv4; getDerivs(p4, v4, dp4, dv4, M);

                    float prev_y = cur_pos.y;

                    cur_pos += (dp1 + 2.0 * dp2 + 2.0 * dp3 + dp4) * (DL / 6.0);
                    cur_vel += (dv1 + 2.0 * dv2 + 2.0 * dv3 + dv4) * (DL / 6.0);

                    if (prev_y * cur_pos.y <= 0.0) {
                        float t = abs(prev_y) / (abs(prev_y) + abs(cur_pos.y));
                        vec3 intersectPos = mix(cur_pos - cur_vel * DL, cur_pos, t);
                        float hit_r = length(intersectPos);

                        if (hit_r >= R_in && hit_r <= R_out) {
                            float vphi = sqrt(R_s / (2.0 * hit_r));
                            float phi = atan(intersectPos.z, intersectPos.x);
                            
                            // Disk flow velocity vector matching
                            vec3 tangent = normalize3(vec3(-sin(phi), 0.0, cos(phi)));
                            vec3 los = normalize3(camPos - intersectPos);

                            float cosA = dot(tangent, los);
                            float doppler = 1.0 / (sqrt(1.0 - vphi * vphi) * (1.0 - vphi * cosA));
                            float grav = sqrt(1.0 - R_s / hit_r);

                            // Blinding Energy Tuning: Shifted to a higher physical weight (55%) for dynamic flare brilliance
                            float cinematicDoppler = mix(1.0, doppler, 0.55);
                            
                            float noiseFactor = 0.85 + 0.15 * sin(phi * 9.0 - u_time * 2.5) * cos(hit_r * 1.5);
                            float T = (6600.0 * pow(R_in / hit_r, 0.6) * noiseFactor) * cinematicDoppler * grav;

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
                u_camTilt: { value: this.settings.camTilt },
                u_camPan: { value: this.settings.camPan },
                u_fov: { value: this.settings.fov },
                R_s: { value: this.settings.R_s },
                R_in: { value: this.settings.R_in },
                R_out: { value: this.settings.R_out }
            }
        });

        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(this.mesh);
    }

    setupInteraction() {
        // Handle Pointer-down interaction anchors
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        // Compute polar coordinate drag deltas smoothly
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const deltaX = e.clientX - this.previousMousePosition.x;
            const deltaY = e.clientY - this.previousMousePosition.y;

            // Sensitivity scalar coefficients
            this.settings.camPan -= deltaX * 0.007;
            this.settings.camTilt = THREE.MathUtils.clamp(
                this.settings.camTilt - deltaY * 0.007,
                0.01 * Math.PI, 
                0.99 * Math.PI
            );

            // Directly inject updated angles to active shader execution context
            this.material.uniforms.u_camTilt.value = this.settings.camTilt;
            this.material.uniforms.u_camPan.value = this.settings.camPan;

            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Add matching support touch configurations for mobile viewports
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            if (!this.isDragging || e.touches.length !== 1) return;
            const deltaX = e.touches[0].clientX - this.previousMousePosition.x;
            const deltaY = e.touches[0].clientY - this.previousMousePosition.y;

            this.settings.camPan -= deltaX * 0.009;
            this.settings.camTilt = THREE.MathUtils.clamp(this.settings.camTilt - deltaY * 0.009, 0.05, Math.PI - 0.05);

            this.material.uniforms.u_camTilt.value = this.settings.camTilt;
            this.material.uniforms.u_camPan.value = this.settings.camPan;

            this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });

        window.addEventListener('touchend', () => { this.isDragging = false; });
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
//  DOM INIT STRAP
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
