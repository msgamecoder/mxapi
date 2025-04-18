(function () {
    const primary = "https://msworld.onrender.com";
    const fallback = "https://msworldd.onrender.com";
    let primaryUptime = localStorage.getItem('primaryUptime') || 0; // Retrieve uptime from localStorage
    let fallbackUptime = localStorage.getItem('fallbackUptime') || 0; // Retrieve uptime from localStorage
    let primaryInterval, fallbackInterval;

    // Function to check the API status
    async function checkAPI(url) {
        try {
            const response = await fetch(url + "/", { method: "GET" });
            const text = await response.text();
            return response.ok && text.includes("MXWorld API");
        } catch (err) {
            return false;
        }
    }

    // Function to format seconds into days, hours, and minutes
    function formatUptime(seconds) {
        const days = Math.floor(seconds / (24 * 60 * 60));
        const hours = Math.floor((seconds % (24 * 60 * 60)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secondsLeft = seconds % 60;
        return `${days}d ${hours}h ${minutes}m ${secondsLeft}s`;
    }

    // Function to update API status and data
    async function updateStatus() {
        const primaryStatus = document.getElementById("primaryStatus");
        const fallbackStatus = document.getElementById("fallbackStatus");
        const primaryUptimeElement = document.getElementById("primaryUptime");
        const fallbackUptimeElement = document.getElementById("fallbackUptime");

        const primaryAlive = await checkAPI(primary);
        const fallbackAlive = await checkAPI(fallback);

        // Handle primary API status
        if (primaryAlive) {
            primaryStatus.textContent = "Primary API is ONLINE ✅";
            primaryStatus.classList.remove("checking", "down");
            primaryStatus.classList.add("active");

            // Start or resume the uptime counter
            if (!primaryInterval) {
                primaryInterval = setInterval(() => {
                    primaryUptime++;
                    localStorage.setItem('primaryUptime', primaryUptime); // Store uptime in localStorage
                    primaryUptimeElement.textContent = formatUptime(primaryUptime);
                }, 1000);
            }
        } else {
            primaryStatus.textContent = "Primary API is DOWN ❌";
            primaryStatus.classList.remove("checking", "active");
            primaryStatus.classList.add("down");

            // Stop the uptime counter when API is down
            clearInterval(primaryInterval);
            primaryInterval = null;
            primaryUptimeElement.textContent = formatUptime(primaryUptime); // Display current uptime
        }

        // Handle fallback API status
        if (fallbackAlive) {
            fallbackStatus.textContent = "Fallback API is ONLINE ✅";
            fallbackStatus.classList.remove("checking", "down");
            fallbackStatus.classList.add("active");

            // Start or resume the uptime counter
            if (!fallbackInterval) {
                fallbackInterval = setInterval(() => {
                    fallbackUptime++;
                    localStorage.setItem('fallbackUptime', fallbackUptime); // Store uptime in localStorage
                    fallbackUptimeElement.textContent = formatUptime(fallbackUptime);
                }, 1000);
            }
        } else {
            fallbackStatus.textContent = "Fallback API is DOWN ❌";
            fallbackStatus.classList.remove("checking", "active");
            fallbackStatus.classList.add("down");

            // Stop the uptime counter when API is down
            clearInterval(fallbackInterval);
            fallbackInterval = null;
            fallbackUptimeElement.textContent = formatUptime(fallbackUptime); // Display current uptime
        }
    }

    // Function to check the API status manually
    function checkAPIStatus() {
        document.getElementById("primaryStatus").classList.remove("active", "down");
        document.getElementById("primaryStatus").classList.add("checking");
        document.getElementById("primaryStatus").textContent = "Checking Primary API...";

        document.getElementById("fallbackStatus").classList.remove("active", "down");
        document.getElementById("fallbackStatus").classList.add("checking");
        document.getElementById("fallbackStatus").textContent = "Checking Fallback API...";

        updateStatus();
    }

    // Expose checkAPIStatus globally
    window.checkAPIStatus = function () {
        checkAPIStatus();
    }

    // Initial status check when the page loads
    updateStatus();

    // Function to get the working API URL
window.getWorkingAPI = async function() {
    // Check primary API
    const primaryAlive = await checkAPI(primary);
    if (primaryAlive) {
        return primary;
    }
    // Check fallback API if primary is down
    const fallbackAlive = await checkAPI(fallback);
    if (fallbackAlive) {
        return fallback;
    }
    // Return null or a default value if both APIs are down
    throw new Error('Both primary and fallback APIs are down.');
};

})();
