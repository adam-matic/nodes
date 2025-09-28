/**
 * API Client for Modular Math Language Web Interface
 * Handles communication with the backend server for code compilation and execution
 */

class APIClient {
    constructor() {
        this.baseUrl = this.detectServerUrl();
        this.connected = false;
        this.checkConnection();
    }

    detectServerUrl() {
        // Detect server URL based on current location
        return window.location.origin;
    }

    async checkConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/api/status`, {
                method: 'GET',
                timeout: 5000
            });
            this.connected = response.ok;
        } catch (error) {
            this.connected = false;
        }

        this.updateConnectionStatus();
        return this.connected;
    }

    updateConnectionStatus() {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            if (this.connected) {
                statusElement.textContent = 'Server Connected';
                statusElement.className = 'connection-status connected';
            } else {
                statusElement.textContent = 'Server Disconnected';
                statusElement.className = 'connection-status disconnected';
            }
        }
    }

    async compileCode(code) {
        if (!this.connected) {
            throw new Error('Server not available. Please start the Python server.');
        }

        const response = await fetch(`${this.baseUrl}/api/compile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code })
        });

        const result = await response.json();
        return result;
    }

    async executeStep() {
        if (!this.connected) {
            throw new Error('Server not available. Please start the Python server.');
        }

        const response = await fetch(`${this.baseUrl}/api/step`, {
            method: 'POST'
        });

        const result = await response.json();
        return result;
    }

    async runProgram() {
        if (!this.connected) {
            throw new Error('Server not available. Please start the Python server.');
        }

        const response = await fetch(`${this.baseUrl}/api/run`, {
            method: 'POST'
        });

        const result = await response.json();
        return result;
    }

    async resetProgram() {
        if (!this.connected) {
            throw new Error('Server not available. Please start the Python server.');
        }

        const response = await fetch(`${this.baseUrl}/api/reset`, {
            method: 'POST'
        });

        const result = await response.json();
        return result;
    }

    async getSignals() {
        if (!this.connected) {
            throw new Error('Server not available. Please start the Python server.');
        }

        const response = await fetch(`${this.baseUrl}/api/signals`);
        const signals = await response.json();
        return signals;
    }
}

// Global API client instance
window.apiClient = new APIClient();