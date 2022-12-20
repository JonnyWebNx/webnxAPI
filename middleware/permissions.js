const User = require("../model/user")
const permissions = async (req, res, next) => {
    const { role } = await User.findById(req.user.user_id)
    if(role == 'admin'||role == 'kiosk'|| role =='inventory') {
        return next();
    }
    return res.status(403).send("Invalid permissions.");
}

module.exports = permissions;
