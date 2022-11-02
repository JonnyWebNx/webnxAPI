const isAuth = async (req, res) => {
    // User was authenticated through token
    res.status(200).send(req.user);
}
module.exports = isAuth;