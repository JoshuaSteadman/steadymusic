const canvas = document.getElementById('visualizer');
const gl = canvas.getContext('webgl');

let audioContext, analyser, dataArray;
let settings = {
    iterations: 200,
    zoom: 1,
    speed: 1,
    audioReactivity: 1,
    kaleidoscopeSegments: 6
};

let targetSettings = {...settings};
const transitionSpeed = 0.05;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

document.querySelectorAll('#menu input').forEach(input => {
    input.addEventListener('input', (e) => {
        targetSettings[e.target.id] = parseFloat(e.target.value);
    });
});

function smoothTransition() {
    for (let key in settings) {
        if (settings[key] !== targetSettings[key]) {
            settings[key] += (targetSettings[key] - settings[key]) * transitionSpeed;
        }
    }
}

function fluctuateControls() {
    targetSettings.iterations = 200 + Math.sin(Date.now() * 0.001) * 100;
    targetSettings.zoom = 1 + Math.sin(Date.now() * 0.0005) * 0.5;
    targetSettings.audioReactivity = 1 + Math.sin(Date.now() * 0.0007) * 0.5;
    targetSettings.kaleidoscopeSegments = 6 + Math.sin(Date.now() * 0.0002) * 3;
    
    document.getElementById('iterations').value = targetSettings.iterations;
    document.getElementById('zoom').value = targetSettings.zoom;
    document.getElementById('speed').value = targetSettings.speed;
    document.getElementById('audioReactivity').value = targetSettings.audioReactivity;
    document.getElementById('kaleidoscopeSegments').value = Math.round(targetSettings.kaleidoscopeSegments);
}

const vertexShaderSource = `
    attribute vec2 a_position;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
`;

const fragmentShaderSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_zoom;
    uniform float u_iterations;
    uniform float u_audioReactivity;
    uniform float u_bassIntensity;
    uniform float u_midIntensity;
    uniform float u_highIntensity;
    uniform float u_kaleidoscopeSegments;

    #define PI 3.14159265359

    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    vec2 kaleidoscope(vec2 uv, float segments) {
        float angle = atan(uv.y, uv.x);
        float radius = length(uv);
        angle = mod(angle, 2.0 * PI / segments);
        angle = abs(angle - PI / segments);
        return vec2(cos(angle), sin(angle)) * radius;
    }

    void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);
        
        uv = kaleidoscope(uv, u_kaleidoscopeSegments);
        
        vec2 z = uv * 3.0 / u_zoom;
        vec2 c = vec2(
            0.285 + 0.01 * sin(u_time * 0.17),
            0.01 + 0.01 * cos(u_time * 0.23)
        );
        
        float iter = 0.0;
        for (float i = 0.0; i < 1000.0; i++) {
            if (i > u_iterations) break;
            z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
            if (dot(z, z) > 4.0) break;
            iter++;
        }

        if (iter < u_iterations) {
            float f = iter / u_iterations;
            
            float hue = fract(f * 3.0 + u_time * 0.1 + u_bassIntensity * 0.2 + u_midIntensity * 0.1);
            float sat = 0.7 + 0.3 * sin(f * 20.0) + u_highIntensity * 0.3;
            float val = 0.7 + u_bassIntensity * 0.3;
            
            vec3 color = hsv2rgb(vec3(hue, sat, val));
            
            float glow = exp(-f * 3.0) * 0.3;
            color += glow * vec3(0.7, 0.5, 0.2);
            
            color += u_audioReactivity * u_bassIntensity * vec3(0.1, 0.0, 0.25);
            
            color *= 0.9 + 0.1 * sin(u_time * 2.0 + f * 10.0) * (1.0 + u_bassIntensity * u_audioReactivity);
            
            gl_FragColor = vec4(color, 1.0);
        } else {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
const program = createProgram(gl, vertexShader, fragmentShader);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
gl.enableVertexAttribArray(positionAttributeLocation);
gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

const uniformLocations = {
    resolution: gl.getUniformLocation(program, "u_resolution"),
    time: gl.getUniformLocation(program, "u_time"),
    zoom: gl.getUniformLocation(program, "u_zoom"),
    iterations: gl.getUniformLocation(program, "u_iterations"),
    audioReactivity: gl.getUniformLocation(program, "u_audioReactivity"),
    bassIntensity: gl.getUniformLocation(program, "u_bassIntensity"),
    midIntensity: gl.getUniformLocation(program, "u_midIntensity"),
    highIntensity: gl.getUniformLocation(program, "u_highIntensity"),
    kaleidoscopeSegments: gl.getUniformLocation(program, "u_kaleidoscopeSegments")
};

function draw(time) {
    smoothTransition();
    
    gl.useProgram(program);
    
    gl.uniform2f(uniformLocations.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniformLocations.time, time * 0.001 * settings.speed);
    gl.uniform1f(uniformLocations.zoom, settings.zoom);
    gl.uniform1f(uniformLocations.iterations, settings.iterations);
    gl.uniform1f(uniformLocations.audioReactivity, settings.audioReactivity);
    gl.uniform1f(uniformLocations.kaleidoscopeSegments, settings.kaleidoscopeSegments);
    
    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        const bassIntensity = dataArray.slice(0, 4).reduce((a, b) => a + b, 0) / (4 * 255);
        const midIntensity = dataArray.slice(4, 12).reduce((a, b) => a + b, 0) / (8 * 255);
        const highIntensity = dataArray.slice(12, 32).reduce((a, b) => a + b, 0) / (20 * 255);
        gl.uniform1f(uniformLocations.bassIntensity, bassIntensity);
        gl.uniform1f(uniformLocations.midIntensity, midIntensity);
        gl.uniform1f(uniformLocations.highIntensity, highIntensity);
    } else {
        gl.uniform1f(uniformLocations.bassIntensity, 0);
        gl.uniform1f(uniformLocations.midIntensity, 0);
        gl.uniform1f(uniformLocations.highIntensity, 0);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Audio setup
let audioElement = new Audio();
audioElement.crossOrigin = "anonymous";
const playPauseBtn = document.getElementById('playPause');
const volumeSlider = document.getElementById('volume');
const stationSelect = document.getElementById('station');
const playlistItems = document.getElementById('playlist-items');

function setupAudioNodes() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const source = audioContext.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
    } catch (error) {
        console.error('Error setting up audio nodes:', error);
        alert('Failed to set up audio. Please try reloading the page.');
    }
}

playPauseBtn.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    if (audioElement.paused) {
        audioElement.play().catch(error => {
            console.error('Error playing audio:', error);
            alert('Failed to play audio. Please try again.');
        });
        playPauseBtn.textContent = 'Pause';
        if (!analyser) {
            setupAudioNodes();
        }
    } else {
        audioElement.pause();
        playPauseBtn.textContent = 'Play';
    }
});

volumeSlider.addEventListener('input', (e) => {
    audioElement.volume = e.target.value;
});

function shufflePlaylist() {
    const options = Array.from(stationSelect.options);
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }
    options.forEach(option => stationSelect.appendChild(option));
    updatePlaylistUI();
}

function autoChangeStation() {
    const options = stationSelect.options;
    let currentIndex = stationSelect.selectedIndex;
    currentIndex = (currentIndex + 1) % options.length;
    stationSelect.selectedIndex = currentIndex;
    audioElement.src = options[currentIndex].value;
    if (playPauseBtn.textContent === 'Play') {
        playPauseBtn.click();
    } else {
        audioElement.play().catch(error => {
            console.error('Error playing next track:', error);
            alert('Failed to play the next track. Please try again.');
        });
    }
    updatePlaylistUI();
}

audioElement.addEventListener('ended', () => {
    autoChangeStation();
});

stationSelect.addEventListener('change', (e) => {
    audioElement.src = e.target.value;
    if (playPauseBtn.textContent === 'Play') {
        playPauseBtn.click();
    } else {
        audioElement.play().catch(error => {
            console.error('Error playing selected track:', error);
            alert('Failed to play the selected track. Please try again.');
        });
    }
    updatePlaylistUI();
});

// Drag and drop functionality
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('fileInput');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    document.body.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, unhighlight, false);
});

function highlight() {
    dropZone.style.display = 'flex';
}

function unhighlight() {
    dropZone.style.display = 'none';
}

document.body.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFileSelect(event) {
    const files = event.target.files;
    handleFiles(files);
}

fileInput.addEventListener('change', handleFileSelect);

function handleFiles(files) {
    ([...files]).forEach(uploadFile);
}

// Touch events for tablets
let touchStartY = 0;
let touchEndY = 0;

document.body.addEventListener('touchstart', (e) => {
    touchStartY = e.changedTouches[0].screenY;
});

document.body.addEventListener('touchend', (e) => {
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
});

function handleSwipe() {
    const swipeDistance = touchStartY - touchEndY;
    if (swipeDistance > 50) {  // Adjust this value to change swipe sensitivity
        fileInput.click();
    }
}

function uploadFile(file) {
    if (file.type.startsWith('audio/')) {
        const option = document.createElement('option');
        option.value = URL.createObjectURL(file);
        option.textContent = file.name;
        stationSelect.appendChild(option);
        updatePlaylistUI();
        
        if (audioElement.paused && stationSelect.options.length === 1) {
            stationSelect.selectedIndex = stationSelect.options.length - 1;
            audioElement.src = option.value;
            audioElement.play().catch(error => {
                console.error('Error playing uploaded file:', error);
                alert('Failed to play the uploaded file. Please try again.');
            });
            playPauseBtn.textContent = 'Pause';
            if (!analyser) {
                setupAudioNodes();
            }
        }
    } else {
        alert('Please select only audio files.');
    }
}

function updatePlaylistUI() {
    playlistItems.innerHTML = '';
    Array.from(stationSelect.options).forEach((option, index) => {
        const li = document.createElement('li');
        li.textContent = option.textContent;
        li.addEventListener('click', () => {
            stationSelect.selectedIndex = index;
            audioElement.src = option.value;
            
            if (audioElement.paused) {
                playPauseBtn.click();
            } else {
                audioElement.play().catch(error => {
                    console.error('Error playing selected track:', error);
                    alert('Failed to play the selected track. Please try again.');
                });
            }
        });
        playlistItems.appendChild(li);
    });
}

// Control visibility
const controls = document.getElementById('controls');
const menu = document.getElementById('menu');
const playlist = document.getElementById('playlist');
let timeout;

function showControls() {
    controls.style.opacity = '1';
    menu.style.opacity = '1';
    playlist.style.opacity = '1';
    clearTimeout(timeout);
    timeout = setTimeout(hideControls, 3000);
}

function hideControls() {
    controls.style.opacity = '0';
    menu.style.opacity = '0';
    playlist.style.opacity = '0';
}

document.addEventListener('mousemove', showControls);

function showMessage(message, duration = 3000) {
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    messageEl.style.position = 'fixed';
    messageEl.style.top = '20px';
    messageEl.style.left = '50%';
    messageEl.style.transform = 'translateX(-50%)';
    messageEl.style.background = 'rgba(0, 0, 0, 0.7)';
    messageEl.style.color = '#fff';
    messageEl.style.padding = '10px 20px';
    messageEl.style.borderRadius = '5px';
    messageEl.style.zIndex = '2000';
    document.body.appendChild(messageEl);
    
    setTimeout(() => {
        document.body.removeChild(messageEl);
    }, duration);
}

function showInitialMessage() {
    showMessage('Swipe up to add audio files', 5000);
}

// Optimized animation loop
let lastFluctuateTime = 0;
function animationLoop(currentTime) {
    if (currentTime - lastFluctuateTime > 100) {  // Still update every 100ms
        fluctuateControls();
        lastFluctuateTime = currentTime;
    }
    
    draw(currentTime);
    requestAnimationFrame(animationLoop);
}

// Initial setup
window.addEventListener('load', () => {
    shufflePlaylist();
    audioElement.src = stationSelect.value;
    hideControls(); // Hide controls initially
    updatePlaylistUI();
    showInitialMessage();
    requestAnimationFrame(animationLoop);
});
