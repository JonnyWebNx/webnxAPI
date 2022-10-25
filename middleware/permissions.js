const permissions = (req, res, next) => {
    if(req.user.admin) {
        return next();
    }
    return res.status(403).send("Invalid permissions.");
}

module.exports = permissions;