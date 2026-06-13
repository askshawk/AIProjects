// SimRefinery Game Engine
// Oil Refinery Management Simulation

class SimRefineryGame {
    constructor() {
        this.gameState = {
            day: 1,
            budget: 100000,
            isPaused: false,
            learningMode: false,

            // Operations
            oilInput: 200,
            refiningSpeed: 1.0,
            safetyLevel: 50,
            environmentalCompliance: 50,

            // Resources
            crudStorage: 5000,
            maxCrudStorage: 10000,
            productStorage: 3000,
            maxProductStorage: 8000,

            // System State
            systemHealth: 100,
            safetyViolations: 0,
            emissionsLevel: 'Low',
            efficiency: 80,

            // Financial
            totalRevenue: 0,
            totalCosts: 0,
            dayRevenue: 0,
            dayCosts: 0,
        };

        this.eventLog = [];
        this.disasterActive = false;
        this.disasterType = null;
        this.disasterIntensity = 0;

        this.initializeEventListeners();
        this.updateDisplay();
        this.logEvent('Refinery initialized and ready for operation', 'info');
    }

    initializeEventListeners() {
        // Control sliders
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

        // Action buttons
        document.getElementById('advanceDay').addEventListener('click', () => this.advanceDay());
        document.getElementById('pauseGame').addEventListener('click', () => this.togglePause());
        document.getElementById('triggerDisaster').addEventListener('click', () => this.triggerRandomDisaster());
        document.getElementById('resetGame').addEventListener('click', () => this.resetGame());
        document.getElementById('toggleLearning').addEventListener('click', () => this.toggleLearningMode());
    }

    simulateOperations() {
        if (this.gameState.isPaused) return;

        // Calculate crude oil processing
        const inputCapacity = this.gameState.oilInput * this.gameState.refiningSpeed;
        const actualInput = Math.min(inputCapacity, this.gameState.crudStorage);

        // Simulate distillation efficiency
        const distillationEfficiency = 0.85;
        const crackingEfficiency = 0.75;
        const outputCapacity = actualInput * distillationEfficiency * crackingEfficiency * (this.gameState.efficiency / 100);

        // Update storage levels
        this.gameState.crudStorage = Math.max(0, this.gameState.crudStorage - actualInput);
        this.gameState.productStorage = Math.min(this.gameState.maxProductStorage, this.gameState.productStorage + outputCapacity);

        // Handle refinery disasters impact
        if (this.disasterActive) {
            this.applyDisasterEffects(actualInput, outputCapacity);
        }

        // Calculate financial metrics
        const pricePerBarrel = 85; // Dollars per barrel
        this.gameState.dayRevenue = outputCapacity * pricePerBarrel;

        // Operating costs
        const baseCost = 5000;
        const safetyMaintenanceCost = (100 - this.gameState.safetyLevel) * 50;
        const environmentalComplianceCost = (100 - this.gameState.environmentalCompliance) * 30;
        const operatingCost = (actualInput * 8) + baseCost + safetyMaintenanceCost + environmentalComplianceCost;

        this.gameState.dayCosts = operatingCost;
        this.gameState.budget += this.gameState.dayRevenue - operatingCost;
        this.gameState.totalRevenue += this.gameState.dayRevenue;
        this.gameState.totalCosts += operatingCost;

        // Safety violations based on neglect
        if (this.gameState.safetyLevel < 30) {
            if (Math.random() < 0.3) {
                this.gameState.safetyViolations++;
                this.logEvent('⚠️ Safety violation detected! Reduce operations.', 'warning');
            }
        }

        // System health degradation
        if (this.gameState.safetyLevel < 40) {
            this.gameState.systemHealth = Math.max(0, this.gameState.systemHealth - 1);
        } else if (this.gameState.systemHealth < 100) {
            this.gameState.systemHealth = Math.min(100, this.gameState.systemHealth + 0.5);
        }

        // Environmental emissions
        if (this.gameState.environmentalCompliance > 70) {
            this.gameState.emissionsLevel = 'Low';
        } else if (this.gameState.environmentalCompliance > 40) {
            this.gameState.emissionsLevel = 'Medium';
        } else {
            this.gameState.emissionsLevel = 'High';
        }

        // Efficiency calculations
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

        // Random events
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
        btn.textContent = this.gameState.isPaused ? 'Resume' : 'Pause';
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
            '<strong>Crude Oil Input:</strong> Higher input increases production but uses more storage.',
            '<strong>Refining Speed:</strong> Faster speed produces more but reduces efficiency.',
            '<strong>Safety Level:</strong> Low safety causes violations and system damage.',
            '<strong>Environmental Compliance:</strong> Affects emissions and regulatory penalties.',
            '<strong>Storage Management:</strong> Keep storage balanced to avoid overflow or starvation.',
            '<strong>Profitability:</strong> Balance high production with cost control.',
            '<strong>System Health:</strong> Maintain above 50% to avoid emergency incidents.'
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
        // Metrics
        document.getElementById('crudInput').textContent = this.formatNumber(this.gameState.oilInput);
        document.getElementById('productionOutput').textContent = this.formatNumber(Math.round(
            this.gameState.oilInput * 0.85 * 0.75 * (this.gameState.efficiency / 100)
        ));

        const storagePercent = Math.round((this.gameState.productStorage / this.gameState.maxProductStorage) * 100);
        document.getElementById('storageLevel').textContent = storagePercent;
        document.getElementById('storageFill').style.width = storagePercent + '%';

        document.getElementById('systemHealth').textContent = Math.round(this.gameState.systemHealth);
        document.getElementById('healthFill').style.width = Math.round(this.gameState.systemHealth) + '%';

        // Update health color
        const healthElement = document.getElementById('systemHealth');
        if (this.gameState.systemHealth > 70) {
            healthElement.className = 'metric-value health-good';
        } else if (this.gameState.systemHealth > 40) {
            healthElement.className = 'metric-value health-warning';
            healthElement.style.color = '#f39c12';
        } else {
            healthElement.className = 'metric-value critical-status';
            healthElement.style.color = '#e74c3c';
        }

        // Financial
        document.getElementById('dailyRevenue').textContent = '+$' + this.formatNumber(Math.round(this.gameState.dayRevenue));
        document.getElementById('dailyCosts').textContent = '-$' + this.formatNumber(Math.round(this.gameState.dayCosts));
        document.getElementById('budgetDisplay').textContent = `Budget: $${this.formatNumber(this.gameState.budget)}`;
        document.getElementById('safetyViolations').textContent = this.gameState.safetyViolations;
        document.getElementById('emissionsLevel').textContent = this.gameState.emissionsLevel;

        // Process flow
        const input = this.gameState.oilInput;
        const distillation = Math.round(input * 0.85);
        const cracking = Math.round(distillation * 0.75);
        const output = Math.round(cracking * (this.gameState.efficiency / 100));

        document.getElementById('processInput').textContent = this.formatNumber(input);
        document.getElementById('processDistillation').textContent = this.formatNumber(distillation);
        document.getElementById('processCracking').textContent = this.formatNumber(cracking);
        document.getElementById('processOutput').textContent = this.formatNumber(output);

        // Disaster status
        if (this.disasterActive) {
            this.logEvent(`🚨 ${this.disasterType.toUpperCase()} DISASTER IN PROGRESS (Intensity: ${this.disasterIntensity})`, 'critical');
        }
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const game = new SimRefineryGame();

    // Auto-advance days every 5 seconds when not paused
    setInterval(() => {
        if (!game.gameState.isPaused && !game.disasterActive) {
            game.advanceDay();
        }
    }, 5000);

    // Update display every second
    setInterval(() => {
        game.updateDisplay();
    }, 1000);
});
