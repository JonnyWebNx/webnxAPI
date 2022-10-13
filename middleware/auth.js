const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
    // Get token from client request
    const token = 
        req.body.token || req.query.token || req.headers["x-access-token"];
    // If no token
    if(!token) {
        return res.status(401).send("A token is required for authentication.");
    }
    try {
        // Decode user token
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded;
    } catch(err) {
        // If token is invalid
        return res.status(401).send("Invalid Token");
    }
    return next();
}

module.exports = verifyToken;