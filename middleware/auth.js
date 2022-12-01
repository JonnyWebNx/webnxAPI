const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
    // Get token from client request
    const token = req.headers["authorization"];
    // If no token
    if (!token) {
        return res.status(401).send("You must login to continue.");
    }
    try {
        // Decode user token
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded;
    } catch (err) {
        // If token is invalid
        return res.status(401).send("Login expired.");
    }
    return next();
}

module.exports = verifyToken;