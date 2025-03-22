const logging = {
    info: (message) => {
        console.log(`INFO: ${message}`);
    },
    error: (message) => {
        console.log(`ERROR: ${message}`);
    },
    infoSection: (message) => {
        console.log(`============ ${message} ============`);
    },
}

module.exports = logging;