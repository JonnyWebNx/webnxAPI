const User = require("../model/user")
const permissions = async (req, res, next) => {
    const { admin } = await User.findById(req.user.user_id)
    if(admin) {
        return next();
    }
    return res.status(403).send("Invalid permissions.");
}

module.exports = permissions;