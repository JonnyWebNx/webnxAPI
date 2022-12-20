const sanitize = require("mongo-sanitize");

const sanitizeInput = (req, res, next) => {
    req.query = sanitize(req.query);
    req.body = sanitize(req.body);
    return next();
}

module.exports = sanitizeInput;
