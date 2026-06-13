// SimRefinery Enhanced Game Engine
// With visual graphics, animations, and interactive objects

class SimRefineryEnhanced {
    constructor() {
        this.gameState = {
            day: 1,
            budget: 100000,
            isPaused: false,
            learningMode: false,

            oilInput: 200,
            refiningSpeed: 1.0,
            safetyLevel: 50,
            environmentalCompliance: 50,

            crudStorage: 5000,
            maxCrudStorage: 10000,
            productStorage: 3000,
            maxProductStorage: 8000,

            systemHealth: 100,
            safetyViolations: 0,
            emissionsLevel: 'Low',
            efficiency: 80,

            totalRevenue: 0,
            totalCosts: 0,
            dayRevenue: 0,
            dayCosts: 0,
        };

        this.eventLog = [];
        this.disasterActive = false;
        this.disasterType = null;
        this.disasterIntensity = 0;
        this.animationFrame = 0;

        // Canvas setup
        this.refineryCanvas = document.getElementById('refineryCanvas');
        this.refineryCtx = this.refineryCanvas.getContext('2d');

        this.healthGaugeCanvas = document.getElementById('healthGauge');
        this.healthGaugeCtx = this.healthGaugeCanvas.getContext('2d');

        this.safetyGaugeCanvas = document.getElementById('safetyGauge');
        this.safetyGaugeCtx = this.safetyGaugeCanvas.getContext('2d');

        this.complianceGaugeCanvas = document.getElementById('complianceGauge');
        this.complianceGaugeCtx = this.complianceGaugeCanvas.getContext('2d');

        this.efficiencyGaugeCanvas = document.getElementById('efficiencyGauge');
        this.efficiencyGaugeCtx = this.efficiencyGaugeCanvas.getContext('2d');

        this.initializeEventListeners();
        this.updateDisplay();
        this.logEvent('Refinery initialized and ready for operation', 'info');
        this.startAnimationLoop();
    }

    startAnimationLoop() {
        setInterval(() => {
            this.animationFrame++;
            this.drawRefinery();
            this.drawGauges();
        }, 50);
    }

    drawRefinery() {
        const ctx = this.refineryCtx;
        const w = this.refineryCanvas.width;
        const h = this.refineryCanvas.height;

        // Clear canvas
        ctx.fillStyle = '#f0f4f8';
        ctx.fillRect(0, 0, w, h);

        // Draw background grid
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i < w; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, h);
            ctx.stroke();
        }

        // Crude Oil Storage Tank
        this.drawTank(ctx, 80, 150, 'Crude Oil', this.gameState.crudStorage / this.gameState.maxCrudStorage, '#8B4513');

        // Distillation Tower
        this.drawDistillationTower(ctx, 300, 100);

        // Cracking Unit
        this.drawCrackingUnit(ctx, 500, 150);

        // Product Storage Tank
        this.drawTank(ctx, 700, 150, 'Product', this.gameState.productStorage / this.gameState.maxProductStorage, '#FFD700');

        // Draw pipes with animated flow
        this.drawAnimatedPipe(ctx, 130, 180, 250, 180);
        this.drawAnimatedPipe(ctx, 350, 150, 450, 180);
        this.drawAnimatedPipe(ctx, 550, 180, 650, 180);

        // Draw system health indicator
        this.drawHealthIndicator(ctx, w - 120, 20);

        // Draw disaster effects
        if (this.disasterActive) {
            this.drawDisasterEffects(ctx);
        }
    }

    drawTank(ctx, x, y, label, fillLevel, color) {
        // Tank body
        ctx.fillStyle = '#ddd';
        ctx.fillRect(x - 30, y - 50, 60, 100);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 30, y - 50, 60, 100);

        // Liquid inside
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x - 28, y - 48 + (100 - 100 * fillLevel), 56, 100 * fillLevel);
        ctx.globalAlpha = 1;

        // Tank label
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y + 70);

        // Fill percentage
        ctx.font = 'bold 14px Arial';
        ctx.fillText(Math.round(fillLevel * 100) + '%', x, y + 5);
    }

    drawDistillationTower(ctx, x, y) {
        // Tower structure
        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(x - 20, y, 40, 150);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 20, y, 40, 150);

        // Heating section (animated)
        const heatIntensity = (this.animationFrame % 20) / 20;
        ctx.fillStyle = `rgba(255, ${100 + heatIntensity * 100}, 0, 0.5)`;
        ctx.fillRect(x - 18, y + 120, 36, 20);

        // Tower label
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Distillation', x, y + 90);
        ctx.font = '10px Arial';
        ctx.fillText('Tower', x, y + 105);

        // Heat indicator
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(x + 25, y + 120, 8, 20);
    }

    drawCrackingUnit(ctx, x, y) {
        // Cracking unit vessel
        ctx.fillStyle = '#a9a9a9';
        ctx.beginPath();
        ctx.ellipse(x, y, 40, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Pressure indicator (animated)
        const pressure = 50 + Math.sin(this.animationFrame / 10) * 20;
        ctx.fillStyle = pressure > 60 ? '#ff4444' : '#44ff44';
        ctx.fillRect(x + 45, y - 15, 15, 30);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 45, y - 15, 15, 30);

        // Unit label
        ctx.fillStyle = '#333';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Cracking', x, y);
        ctx.font = '9px Arial';
        ctx.fillText('Unit', x, y + 12);
    }

    drawAnimatedPipe(ctx, x1, y1, x2, y2) {
        // Pipe
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Flow animation
        const length = Math.hypot(x2 - x1, y2 - y1);
        const count = Math.floor(length / 20);
        const angle = Math.atan2(y2 - y1, x2 - x1);

        for (let i = 0; i < count; i++) {
            const progress = ((this.animationFrame / 10 + i) % count) / count;
            const x = x1 + (x2 - x1) * progress;
            const y = y1 + (y2 - y1) * progress;

            ctx.fillStyle = '#ff6600';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawHealthIndicator(ctx, x, y) {
        const health = this.gameState.systemHealth;
        const color = health > 70 ? '#44ff44' : health > 40 ? '#ffaa00' : '#ff4444';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y + 15, 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(health) + '%', x, y + 15);

        ctx.fillStyle = '#333';
        ctx.font = '10px Arial';
        ctx.fillText('Health', x, y + 35);
    }

    drawDisasterEffects(ctx) {
        const effects = {
            fire: () => {
                for (let i = 0; i < 5; i++) {
                    const x = 300 + Math.sin(this.animationFrame / 10 + i) * 40;
                    const y = 100 + Math.random() * 60;
                    ctx.fillStyle = `rgba(255, ${100 + Math.random() * 100}, 0, 0.6)`;
                    ctx.beginPath();
                    ctx.arc(x, y, 20 + Math.random() * 10, 0, Math.PI * 2);
                    ctx.fill();
                }
            },
            leak: () => {
                for (let i = 0; i < 8; i++) {
                    const x = 400 + Math.random() * 80;
                    const y = 200 + (this.animationFrame % 50) / 2;
                    ctx.fillStyle = 'rgba(100, 200, 255, 0.5)';
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            },
            equipment: () => {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                ctx.fillRect(250, 100, 100, 100);
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 3;
                ctx.strokeRect(250, 100, 100, 100);
            },
            pressure: () => {
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                for (let r = 20; r < 100; r += 20) {
                    ctx.globalAlpha = 1 - (r / 100);
                    ctx.beginPath();
                    ctx.arc(500, 180, r + (this.animationFrame % 20), 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }
        };

        if (effects[this.disasterType]) {
            effects[this.disasterType]();
        }
    }

    drawGauges() {
        this.drawGauge(this.healthGaugeCtx, this.healthGaugeCanvas, this.gameState.systemHealth, '#44ff44', '#ff4444');
        this.drawGauge(this.safetyGaugeCtx, this.safetyGaugeCanvas, this.gameState.safetyLevel, '#3498db', '#e74c3c');
        this.drawGauge(this.complianceGaugeCtx, this.complianceGaugeCanvas, this.gameState.environmentalCompliance, '#2ecc71', '#e67e22');
        this.drawGauge(this.efficiencyGaugeCtx, this.efficiencyGaugeCanvas, this.gameState.efficiency, '#9b59b6', '#c0392b');
    }

    drawGauge(ctx, canvas, value, color1, color2) {
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const radius = 60;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background circle
        ctx.fillStyle = '#ddd';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Gauge arc
        const startAngle = Math.PI + 0.5;
        const endAngle = Math.PI * 0.5;
        const angle = startAngle + (endAngle - startAngle) * (value / 100);

        // Draw colored arc based on value
        const color = value > 60 ? color1 : color2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 6, startAngle, angle);
        ctx.stroke();

        // Needle
        const needleAngle = startAngle + (endAngle - startAngle) * (value / 100);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(needleAngle) * (radius - 15), cy + Math.sin(needleAngle) * (radius - 15));
        ctx.stroke();

        // Center dot
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();

        // Value text
        ctx.fillStyle = '#333';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(value) + '%', cx, cy);
    }

    initializeEventListeners() {
        document.getElementById('oilInput').addEventListener('input', (e) => {
            this.gameState.oilInput = parseInt(e.target.value);
            document.getElementById('oilInputValue').textContent = this.gameState.oilInput;
            this.updateDisplay();
        });

        document.getElementById('refiningSpeed').addEventListener('input', (e) => {
            this.gameState.refiningSpeed = parseFloat(e.target.value);
            document.getElementById('refiningSpeedValue').textContent = this.gameState.refiningSpeed.toFixed(1) + 'x';
            this.updateDisplay();
        });

        document.getElementById('safetyLevel').addEventListener('input', (e) => {
            this.gameState.safetyLevel = parseInt(e.target.value);
            document.getElementById('safetyLevelValue').textContent = this.gameState.safetyLevel + '%';
            this.updateDisplay();
        });

        document.getElementById('environmentalCompliance').addEventListener('input', (e) => {
            this.gameState.environmentalCompliance = parseInt(e.target.value);
            document.getElementById('environmentalComplianceValue').textContent = this.gameState.environmentalCompliance + '%';
            this.updateDisplay();
        });

        document.getElementById('advanceDay').addEventListener('click', () => this.advanceDay());
        document.getElementById('pauseGame').addEventListener('click', () => this.togglePause());
        document.getElementById('triggerDisaster').addEventListener('click', () => this.triggerRandomDisaster());
        document.getElementById('resetGame').addEventListener('click', () => this.resetGame());
        document.getElementById('toggleLearning').addEventListener('click', () => this.toggleLearningMode());
    }

    simulateOperations() {
        if (this.gameState.isPaused) return;

        const inputCapacity = this.gameState.oilInput * this.gameState.refiningSpeed;
        const actualInput = Math.min(inputCapacity, this.gameState.crudStorage);

        const distillationEfficiency = 0.85;
        const crackingEfficiency = 0.75;
        const outputCapacity = actualInput * distillationEfficiency * crackingEfficiency * (this.gameState.efficiency / 100);

        this.gameState.crudStorage = Math.max(0, this.gameState.crudStorage - actualInput);
        this.gameState.productStorage = Math.min(this.gameState.maxProductStorage, this.gameState.productStorage + outputCapacity);

        if (this.disasterActive) {
            this.applyDisasterEffects(actualInput, outputCapacity);
        }

        const pricePerBarrel = 85;
        this.gameState.dayRevenue = outputCapacity * pricePerBarrel;

        const baseCost = 5000;
        const safetyMaintenanceCost = (100 - this.gameState.safetyLevel) * 50;
        const environmentalComplianceCost = (100 - this.gameState.environmentalCompliance) * 30;
        const operatingCost = (actualInput * 8) + baseCost + safetyMaintenanceCost + environmentalComplianceCost;

        this.gameState.dayCosts = operatingCost;
        this.gameState.budget += this.gameState.dayRevenue - operatingCost;
        this.gameState.totalRevenue += this.gameState.dayRevenue;
        this.gameState.totalCosts += operatingCost;

        if (this.gameState.safetyLevel < 30) {
            if (Math.random() < 0.3) {
                this.gameState.safetyViolations++;
                this.logEvent('⚠️ Safety violation detected! Reduce operations.', 'warning');
            }
        }

        if (this.gameState.safetyLevel < 40) {
            this.gameState.systemHealth = Math.max(0, this.gameState.systemHealth - 1);
        } else if (this.gameState.systemHealth < 100) {
            this.gameState.systemHealth = Math.min(100, this.gameState.systemHealth + 0.5);
        }

        if (this.gameState.environmentalCompliance > 70) {
            this.gameState.emissionsLevel = 'Low';
        } else if (this.gameState.environmentalCompliance > 40) {
            this.gameState.emissionsLevel = 'Medium';
        } else {
            this.gameState.emissionsLevel = 'High';
        }

        this.gameState.efficiency = 60 + (this.gameState.safetyLevel * 0.3) + (this.gameState.environmentalCompliance * 0.1);

        this.updateDisplay();
    }

    applyDisasterEffects(input, output) {
        const disasterMods = {
            fire: { health: -5, efficiency: -30, safetyViolations: 3 },
            leak: { health: -3, efficiency: -15, safetyViolations: 1 },
            equipment: { health: -4, efficiency: -20, safetyViolations: 2 },
            pressure: { health: -2, efficiency: -10, safetyViolations: 1 }
        };

        const mods = disasterMods[this.disasterType] || { health: -2, efficiency: -5, safetyViolations: 0 };

        this.gameState.systemHealth = Math.max(0, this.gameState.systemHealth + mods.health);
        this.gameState.efficiency = Math.max(0, this.gameState.efficiency + mods.efficiency);

        if (mods.safetyViolations > 0) {
            this.gameState.safetyViolations += mods.safetyViolations;
        }

        this.disasterIntensity -= 1;
        if (this.disasterIntensity <= 0) {
            this.endDisaster();
        }
    }

    advanceDay() {
        if (this.gameState.budget < 0) {
            this.logEvent('❌ GAME OVER: Budget depleted! The refinery has closed.', 'critical');
            document.getElementById('advanceDay').disabled = true;
            return;
        }

        this.simulateOperations();
        this.gameState.day++;

        this.checkForRandomEvents();

        document.getElementById('dayCounter').textContent = `Day: ${this.gameState.day}`;

        if (this.gameState.day % 5 === 0) {
            this.logEvent(`📊 Weekly review: Budget: $${this.formatNumber(this.gameState.budget)}, Health: ${this.gameState.systemHealth}%`, 'info');
        }
    }

    checkForRandomEvents() {
        const rand = Math.random();

        if (rand < 0.05 && this.gameState.safetyLevel < 40) {
            this.logEvent('⚠️ Equipment malfunction detected! Increase safety maintenance.', 'warning');
        }

        if (rand < 0.03 && this.gameState.environmentalCompliance < 30) {
            this.logEvent('🌍 EPA warning: Environmental compliance below standards!', 'warning');
            this.gameState.budget -= 5000;
        }

        if (this.gameState.budget > 100000) {
            this.logEvent('💰 Excellent quarter! Revenue exceeds expectations.', 'success');
        }
    }

    triggerRandomDisaster() {
        if (this.disasterActive) {
            this.logEvent('A disaster is already in progress!', 'warning');
            return;
        }

        const disasters = ['fire', 'leak', 'equipment', 'pressure'];
        const selected = disasters[Math.floor(Math.random() * disasters.length)];
        this.triggerDisaster(selected);
    }

    triggerDisaster(type = 'fire') {
        if (this.disasterActive) return;

        this.disasterActive = true;
        this.disasterType = type;
        this.disasterIntensity = 3;

        const messages = {
            fire: '🔥 CRITICAL: Oil fire detected in Unit 3! Initiating emergency protocols.',
            leak: '💧 CRITICAL: Chemical leak detected in the distillation tower!',
            equipment: '⚙️ CRITICAL: Equipment failure in the fractionation unit!',
            pressure: '💥 CRITICAL: Pressure buildup detected in storage tanks!'
        };

        this.logEvent(messages[type], 'critical');
        this.gameState.systemHealth = Math.max(0, this.gameState.systemHealth - 10);
        this.updateDisplay();
    }

    endDisaster() {
        this.disasterActive = false;
        this.disasterType = null;
        this.logEvent('✅ Emergency resolved. System returning to normal operations.', 'success');
    }

    togglePause() {
        this.gameState.isPaused = !this.gameState.isPaused;
        const btn = document.getElementById('pauseGame');
        btn.textContent = this.gameState.isPaused ? '▶️ Resume' : '⏸️ Pause';
        btn.style.backgroundColor = this.gameState.isPaused ? '#e74c3c' : '#2c3e50';
    }

    toggleLearningMode() {
        this.gameState.learningMode = !this.gameState.learningMode;
        const btn = document.getElementById('toggleLearning');
        const panel = document.getElementById('learningPanel');

        btn.textContent = this.gameState.learningMode ? '📚 Learning Mode: ON' : '📚 Learning Mode: OFF';

        if (this.gameState.learningMode) {
            panel.classList.remove('hidden');
            this.updateLearningContent();
        } else {
            panel.classList.add('hidden');
        }
    }

    updateLearningContent() {
        const content = document.getElementById('learningContent');
        const tips = [
            '<strong>Crude Oil Input:</strong> Adjust input to match your processing capacity.',
            '<strong>Refining Speed:</strong> Higher speeds produce more but reduce efficiency and increase wear.',
            '<strong>Safety Level:</strong> Critical for preventing violations and system damage.',
            '<strong>Environmental Compliance:</strong> Affects emissions and regulatory penalties.',
            '<strong>Storage Management:</strong> Balance input and output to maximize production.',
            '<strong>Disaster Management:</strong> Low safety = higher disaster risk.',
            '<strong>Financial Balance:</strong> Profit = Revenue - Operating Costs. Watch both!',
            '<strong>System Health:</strong> When health drops below 50%, operations become risky.'
        ];

        const tip = tips[Math.floor(Math.random() * tips.length)];
        content.innerHTML = `<p>${tip}</p>`;
    }

    resetGame() {
        if (confirm('Are you sure you want to reset the game? All progress will be lost.')) {
            location.reload();
        }
    }

    logEvent(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        this.eventLog.unshift({ message, type, timestamp });

        if (this.eventLog.length > 50) {
            this.eventLog.pop();
        }

        this.updateEventLog();
    }

    updateEventLog() {
        const logElement = document.getElementById('eventLog');
        logElement.innerHTML = this.eventLog.map(event =>
            `<div class="event-entry ${event.type}">${event.message}</div>`
        ).join('');
    }

    formatNumber(num) {
        return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    updateDisplay() {
        document.getElementById('dailyRevenue').textContent = '+$' + this.formatNumber(Math.round(this.gameState.dayRevenue));
        document.getElementById('dailyCosts').textContent = '-$' + this.formatNumber(Math.round(this.gameState.dayCosts));
        document.getElementById('budgetDisplay').textContent = `Budget: $${this.formatNumber(this.gameState.budget)}`;
        document.getElementById('safetyViolations').textContent = this.gameState.safetyViolations;
        document.getElementById('emissionsLevel').textContent = this.gameState.emissionsLevel;
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const game = new SimRefineryEnhanced();

    // Auto-advance days every 5 seconds when not paused
    setInterval(() => {
        if (!game.gameState.isPaused && !game.disasterActive) {
            game.advanceDay();
        }
    }, 5000);
});
