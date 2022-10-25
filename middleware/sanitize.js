const sanitize = require("mongo-sanitize");

const sanitizeInput = (req, res, next) => {
    /**
     * 
     * @todo GET RID OF SCRIPT TAGS
     * 
     * 
     */

    req.query = sanitize(req.query);
    req.body = sanitize(req.body);
    return next();
}

module.exports = sanitizeInput;