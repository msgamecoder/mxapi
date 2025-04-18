const fetch = require('node-fetch'); // make sure to install this if needed

const primary = "https://msworld.onrender.com";
const fallback = "https://msworldd.onrender.com";

async function checkAPI(url) {
    try {
        const res = await fetch(url + "/", { method: "GET" });
        const text = await res.text();
        return res.ok && text.includes("MXWorld API");
    } catch {
        return false;
    }
}

async function getWorkingAPI() {
    if (await checkAPI(primary)) return primary;
    if (await checkAPI(fallback)) return fallback;
    throw new Error("Both primary and fallback APIs are down.");
}

module.exports = { getWorkingAPI };
