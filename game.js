import * as THREE from 'three';

// --- Core Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.015);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ'; 

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Map Design ---
const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshBasicMaterial({ color: 0x1a1a2a }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const colors = [0xff007f, 0x00ffcc, 0xffea00, 0x8a2be2];
for (let i = 0; i < 40; i++) {
    const w = Math.random() * 5 + 2, h = Math.random() * 8 + 2, d = Math.random() * 5 + 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)], wireframe: Math.random() > 0.8 }));
    mesh.position.set((Math.random() - 0.5) * 100, h/2, (Math.random() - 0.5) * 100);
    scene.add(mesh);
}

// --- Player Setup & Physics ---
const player = new THREE.Group();
player.position.set(0, 3, 0);
player.add(camera);
scene.add(player);

let velocityY = 0, isGrounded = true, isSliding = false, slideTimer = 0;
const GRAVITY = -40, JUMP_FORCE = 15, BASE_SPEED = 15;
let currentSpeed = BASE_SPEED;

// --- Health System ---
let maxHealth = 100;
let currentHealth = 100;
let lastDamageTime = 0;
const hpFill = document.getElementById('health-bar-fill');
const hpText = document.getElementById('hp-text');
const damageFlash = document.getElementById('damage-flash');

function takeDamage(amount) {
    const now = Date.now();
    if (now - lastDamageTime < 500) return; 
    lastDamageTime = now;
    
    currentHealth -= amount;
    if(currentHealth < 0) currentHealth = 0;
    updateHealthUI();
    
    damageFlash.style.opacity = '1';
    setTimeout(() => damageFlash.style.opacity = '0', 200);

    if (currentHealth <= 0) die();
}

function heal(amount) {
    currentHealth += amount;
    if(currentHealth > maxHealth) currentHealth = maxHealth;
    updateHealthUI();
    damageFlash.style.backgroundColor = 'rgba(0, 255, 204, 0.4)';
    damageFlash.style.opacity = '1';
    setTimeout(() => {
        damageFlash.style.opacity = '0';
        setTimeout(() => damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0.5)', 200);
    }, 200);
}

function updateHealthUI() {
    hpText.innerText = currentHealth;
    const pct = (currentHealth / maxHealth) * 100;
    hpFill.style.width = pct + '%';
    hpFill.style.backgroundColor = pct > 40 ? '#00ffcc' : '#ff3333';
}

function die() {
    gameState = 'dead';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('mobile-controls').style.display = 'none';
    document.getElementById('game-over').style.display = 'flex';
}

// --- VFX System (NEW) ---
const activeEffects = [];

function createLaser(startPoint, endPoint, color) {
    const distance = startPoint.distanceTo(endPoint);
    const geo = new THREE.BoxGeometry(0.05, 0.05, distance);
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    
    // Position laser between gun and target
    mesh.position.copy(startPoint).lerp(endPoint, 0.5);
    mesh.lookAt(endPoint);
    
    scene.add(mesh);
    activeEffects.push({ mesh: mesh, type: 'laser', life: 1.0 });
}

function createShockwave() {
    const geo = new THREE.SphereGeometry(1, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff007f, wireframe: true, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(player.position);
    scene.add(mesh);
    activeEffects.push({ mesh: mesh, type: 'shockwave', life: 1.0, scale: 1 });
}

function spawnHealParticles() {
    for(let i=0; i<5; i++) {
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        
        // Spawn randomly around camera
        mesh.position.copy(player.position);
        mesh.position.x += (Math.random() - 0.5) * 2;
        mesh.position.z += (Math.random() - 0.5) * 2;
        mesh.position.y -= 1; 
        
        scene.add(mesh);
        activeEffects.push({ mesh: mesh, type: 'heal', life: 1.0 });
    }
}

// --- Weapon & Ability System ---
function buildGunModel(type, color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: color });
    
    if (type === 'pistol') {
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), mat);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), mat);
        grip.position.set(0, -0.1, 0.1);
        group.add(barrel, grip);
    } else if (type === 'blaster') {
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.6), mat);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), mat);
        const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), new THREE.MeshBasicMaterial({color: 0xffffff}));
        grip.position.set(0, -0.15, 0.2);
        scope.position.set(0, 0.1, 0);
        group.add(barrel, grip, scope);
    } else if (type === 'shotgun') {
        const barrel1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), mat);
        const barrel2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), mat);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.15), mat);
        barrel1.position.set(-0.06, 0, 0);
        barrel2.position.set(0.06, 0, 0);
        grip.position.set(0, -0.15, 0.25);
        group.add(barrel1, barrel2, grip);
    }
    return { group, mat };
}

const weapons = [
    { name: 'PISTOL', type: 'pistol', color: 0xaaaaaa, fireRate: 300, ability: 'HEAL', cd: 10000, lastUse: 0, modelObj: null },
    { name: 'BLASTER', type: 'blaster', color: 0x00ffcc, fireRate: 150, ability: 'OVERDRIVE', cd: 15000, lastUse: 0, modelObj: null },
    { name: 'SHOTGUN', type: 'shotgun', color: 0xff007f, fireRate: 900, ability: 'SHOCKWAVE', cd: 12000, lastUse: 0, modelObj: null }
];

let currentWeaponIndex = 0;
let lastShotTime = 0;
let activeWeaponModel = null;
let activeWeaponMat = null;

function equipWeapon(index) {
    if(activeWeaponModel) camera.remove(activeWeaponModel);
    
    const w = weapons[index];
    if(!w.modelObj) w.modelObj = buildGunModel(w.type, w.color);
    
    activeWeaponModel = w.modelObj.group;
    activeWeaponMat = w.modelObj.mat;
    activeWeaponModel.position.set(0.25, -0.2, -0.5);
    camera.add(activeWeaponModel);
    
    document.getElementById('wep-name').innerText = w.name;
    document.getElementById('wep-name').style.color = '#' + w.color.toString(16).padStart(6, '0');
}
equipWeapon(0);

document.getElementById('swap-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    currentWeaponIndex = (currentWeaponIndex + 1) % weapons.length;
    equipWeapon(currentWeaponIndex);
});

// Abilities
let isOverdrive = false;
let overdriveTimer = 0;

document.getElementById('ability-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    const w = weapons[currentWeaponIndex];
    const now = Date.now();
    if (now - w.lastUse < w.cd) return; 
    
    w.lastUse = now;
    
    if (w.name === 'PISTOL') {
        heal(50);
        spawnHealParticles();
    } else if (w.name === 'BLASTER') {
        isOverdrive = true;
        overdriveTimer = 3.0; // 3 seconds of overdrive
    } else if (w.name === 'SHOTGUN') {
        createShockwave();
        enemies.forEach(enemy => {
            const dir = enemy.position.clone().sub(player.position).normalize();
            enemy.position.add(dir.multiplyScalar(20));
            enemy.position.y = 1; 
        });
        damageFlash.style.backgroundColor = 'rgba(255, 0, 127, 0.4)';
        damageFlash.style.opacity = '1';
        setTimeout(() => { damageFlash.style.opacity = '0'; damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; }, 200);
    }
});

setInterval(() => {
    const w = weapons[currentWeaponIndex];
    const remaining = w.cd - (Date.now() - w.lastUse);
    const statusText = document.getElementById('ability-status');
    if (remaining <= 0) {
        statusText.innerText = `${w.ability} READY`;
        statusText.style.color = '#00ffcc';
    } else {
        statusText.innerText = `${w.ability}: ${(remaining/1000).toFixed(1)}s`;
        statusText.style.color = '#ff3333';
    }
}, 100);

// --- Enemy System ---
const enemies = [];
const enemyMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });

function spawnEnemy() {
    const enemy = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), enemyMat);
    do { enemy.position.set((Math.random() - 0.5) * 80, 1, (Math.random() - 0.5) * 80); } 
    while (enemy.position.distanceTo(player.position) < 20);
    scene.add(enemy);
    enemies.push(enemy);
}
for(let i=0; i<6; i++) spawnEnemy();

// --- Mobile Controls ---
let moveF = false, moveB = false, moveL = false, moveR = false;
const bindBtn = (id, dir) => {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); if(dir==='w') moveF=true; if(dir==='s') moveB=true; if(dir==='a') moveL=true; if(dir==='d') moveR=true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); if(dir==='w') moveF=false; if(dir==='s') moveB=false; if(dir==='a') moveL=false; if(dir==='d') moveR=false; });
};
bindBtn('btn-w', 'w'); bindBtn('btn-s', 's'); bindBtn('btn-a', 'a'); bindBtn('btn-d', 'd');

const lookZone = document.getElementById('look-zone');
let touchX = 0, touchY = 0;
lookZone.addEventListener('touchstart', (e) => { touchX = e.touches[0].pageX; touchY = e.touches[0].pageY; });
lookZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const dx = e.touches[0].pageX - touchX;
    const dy = e.touches[0].pageY - touchY;
    touchX = e.touches[0].pageX; touchY = e.touches[0].pageY;
    player.rotation.y -= dx * 0.005;
    camera.rotation.x -= dy * 0.005;
    camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
});

document.getElementById('jump-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isGrounded) { velocityY = JUMP_FORCE; isGrounded = false; }
});
document.getElementById('slide-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isGrounded && !isSliding) { isSliding = true; slideTimer = 0.8; currentSpeed = BASE_SPEED * 1.8; }
});

// Shooting
const raycaster = new THREE.Raycaster();
let kills = 0;

function fireRay(offsetX, offsetY, weaponColor) {
    raycaster.setFromCamera(new THREE.Vector2(offsetX, offsetY), camera);
    const intersects = raycaster.intersectObjects(enemies);
    
    // Calculate start point for laser (gun tip)
    const startPoint = new THREE.Vector3();
    activeWeaponModel.getWorldPosition(startPoint);
    startPoint.y -= 0.1; // adjust closer to barrel
    
    let endPoint = new THREE.Vector3();

    if (intersects.length > 0) {
        const target = intersects[0].object;
        endPoint.copy(intersects[0].point); // Laser stops at enemy
        scene.remove(target);
        enemies.splice(enemies.indexOf(target), 1);
        kills++;
        document.getElementById('kill-count').innerText = kills;
        setTimeout(spawnEnemy, 1500);
    } else {
        // Laser goes off into distance
        raycaster.ray.at(50, endPoint); 
    }
    
    createLaser(startPoint, endPoint, weaponColor);
}

document.getElementById('shoot-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    const now = Date.now();
    const w = weapons[currentWeaponIndex];
    const actualFireRate = isOverdrive && w.name === 'BLASTER' ? 50 : w.fireRate;
    
    if (gameState !== 'playing' || now - lastShotTime < actualFireRate) return;
    lastShotTime = now;

    activeWeaponModel.position.z = -0.3;
    setTimeout(() => { if(activeWeaponModel) activeWeaponModel.position.z = -0.5; }, 50);

    if (w.name === 'SHOTGUN') {
        fireRay(0, 0, w.color);
        fireRay(-0.15, 0, w.color);
        fireRay(0.15, 0, w.color);
    } else {
        // Change laser color if overdrive is active
        const color = (isOverdrive && w.name === 'BLASTER') ? 0xffffff : w.color;
        fireRay(0, 0, color); 
    }
});

// --- Game State ---
let gameState = 'menu';

function startGame() {
    currentHealth = maxHealth;
    kills = 0;
    document.getElementById('kill-count').innerText = kills;
    updateHealthUI();
    player.position.set(0, 3, 0);
    
    document.querySelectorAll('.overlay-menu').forEach(el => el.style.display = 'none');
    document.getElementById('hud').style.display = 'block';
    document.getElementById('mobile-controls').style.display = 'block';
    gameState = 'playing';
}

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('respawn-btn').addEventListener('click', startGame);

// --- Game Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (gameState === 'menu' || gameState === 'dead') {
        camera.rotation.y += 0.3 * delta;
    } 
    else if (gameState === 'playing') {
        
        // Update VFX (Lasers, Shockwaves, Heal Particles)
        for (let i = activeEffects.length - 1; i >= 0; i--) {
            const fx = activeEffects[i];
            fx.life -= delta * 2.5; // Controls how fast effects fade
            
            if (fx.life <= 0) {
                scene.remove(fx.mesh);
                activeEffects.splice(i, 1);
            } else {
                if (fx.type === 'laser') {
                    fx.mesh.material.opacity = fx.life;
                } else if (fx.type === 'shockwave') {
                    fx.scale += delta * 60; // Expand sphere
                    fx.mesh.scale.set(fx.scale, fx.scale, fx.scale);
                    fx.mesh.material.opacity = fx.life;
                } else if (fx.type === 'heal') {
                    fx.mesh.position.y += delta * 4; // Rise up
                    fx.mesh.rotation.y += delta * 5; // Spin
                    fx.mesh.material.opacity = fx.life;
                }
            }
        }
        
        // Overdrive Visuals
        if (isOverdrive) {
            overdriveTimer -= delta;
            // Flash gun white and neon blue
            activeWeaponMat.color.setHex(Math.random() > 0.5 ? 0xffffff : 0x00ffcc);
            if (overdriveTimer <= 0) {
                isOverdrive = false;
                activeWeaponMat.color.setHex(0x00ffcc); // Reset color
            }
        }

        // Physics
        velocityY += GRAVITY * delta;
        player.position.y += velocityY * delta;
        if (player.position.y <= 3) { player.position.y = 3; velocityY = 0; isGrounded = true; }

        // Slide
        if (isSliding) {
            camera.position.y += (-1.5 - camera.position.y) * 10 * delta;
            slideTimer -= delta;
            if (slideTimer <= 0) { isSliding = false; currentSpeed = BASE_SPEED; }
        } else {
            camera.position.y += (0 - camera.position.y) * 10 * delta;
        }

        // Movement
        const direction = new THREE.Vector3();
        if (moveF) direction.z -= 1;
        if (moveB) direction.z += 1;
        if (moveL) direction.x -= 1;
        if (moveR) direction.x += 1;
        
        direction.normalize();
        direction.applyEuler(player.rotation);
        player.position.addScaledVector(direction, currentSpeed * delta);

        // Enemy AI & Damage
        enemies.forEach(enemy => {
            enemy.lookAt(player.position.x, enemy.position.y, player.position.z);
            enemy.translateZ(6 * delta);
            if (enemy.position.distanceTo(player.position) < 3.0) takeDamage(20);
        });
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
