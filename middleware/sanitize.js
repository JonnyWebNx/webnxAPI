const sanitize = require("mongo-sanitize");

const sanitizeInput = (req, res, next) => {
    req.body = sanitize(req.body);
    next();
}

module.exports = sanitizeInput;