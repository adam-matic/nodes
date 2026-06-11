/**
 * Local API Client for the Modular Math Language Web Interface.
 *
 * Drop-in replacement for the old HTTP client: same methods and response
 * shapes, but compilation and execution run in the browser using the JS
 * solver (assets/solver/). No server needed — any static file server works.
 */

class APIClient {
    constructor() {
        this.connected = true; // The solver runs locally; always available
        this.vm = null;
        this.compiled = false;
        this.maxSteps = 0;
        this.updateConnectionStatus();
    }

    async checkConnection() {
        this.connected = true;
        this.updateConnectionStatus();
        return true;
    }

    updateConnectionStatus() {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = 'Local Solver Ready';
            statusElement.className = 'connection-status connected';
        }
    }

    async compileCode(code) {
        try {
            if (!code.trim()) {
                throw new Error('Empty code provided');
            }

            const program = parseString(code);
            const vm = new VirtualMachine();
            vm.loadProgram(program);

            this.vm = vm;
            this.compiled = true;
            this.maxSteps = vm.maxSteps;

            return {
                success: true,
                message: `Program compiled successfully. Max steps: ${vm.maxSteps}`,
                max_steps: vm.maxSteps,
            };
        } catch (error) {
            this.compiled = false;
            return {
                success: false,
                message: `Compilation error: ${error.message}`,
            };
        }
    }

    async runProgram() {
        if (!this.compiled || !this.vm) {
            return {
                success: false,
                message: 'No program compiled. Please compile first.',
            };
        }

        return {
            success: true,
            message: 'Program execution started',
            running: true,
        };
    }

    async executeStep() {
        if (!this.compiled || !this.vm) {
            return {
                success: false,
                message: 'No program compiled. Please compile first.',
            };
        }

        if (this.vm.currentStep >= this.vm.maxSteps) {
            return {
                success: false,
                message: 'Maximum steps reached',
            };
        }

        try {
            this.vm.step();

            return {
                success: true,
                message: `Step ${this.vm.currentStep} executed`,
                step: this.vm.currentStep,
                signals: this.getCurrentSignals(),
                halted: this.vm.halted,
            };
        } catch (error) {
            return {
                success: false,
                message: `Execution error: ${error.message}`,
            };
        }
    }

    async resetProgram() {
        if (this.vm) {
            this.vm.reset();
        }

        return {
            success: true,
            message: 'Program reset',
            step: 0,
        };
    }

    async getSignals() {
        return this.getCurrentSignals();
    }

    getCurrentSignals() {
        const signals = {};
        if (!this.vm) return signals;

        // Values for the step that was just executed (currentStep was
        // incremented after execution unless the program halted)
        const executedStep = Math.max(0, this.vm.currentStep - 1);

        for (const [name, signal] of Object.entries(this.vm.signals)) {
            signals[name] = signal.getValue(executedStep);
        }

        return signals;
    }
}

// Global API client instance
window.apiClient = new APIClient();
