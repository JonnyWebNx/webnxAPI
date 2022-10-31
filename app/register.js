const User = require("../model/user");
const bcrypt = require('bcryptjs');
const sign = require("jsonwebtoken/sign");
const register = async (req, res) => {
    // register logic
    try {
        // Get user input
        const { first_name, last_name, email, password } = req.body;

        // Validate user input
        if (!(email && password && first_name && last_name)) {
            return res.status(400).send("All input is required");
        }

        // check if user already exists
        // Validate if user exists in our database
        const oldUser = await User.findOne({ email });

        if (oldUser) {
            return res.status(409).send("User already exists.  Please login.");
        }

        // Encrypt user password
        encryptedPassword = await bcrypt.hash(password, 10);

        req.body.password = encryptedPassword
        delete req.body.password2
        console.log(req.body)

        // Create user in our database
        var user = await User.create({
            first_name,
            last_name,
            email: email.toLowerCase(),
            password: encryptedPassword,
        });
        // Create token
        const token = sign(
            { user_id: user._id, email },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN,
            }
        );
        // Save user token 
        user.token = token;
        // Get rid of mongoose garbage and delete password
        user = user._doc;
        delete user.password;
        console.log(user)
        // return new user
        return res.status(201).json(user);
    } catch (err) {
        console.log(err);
    }
    // End register logic
}

module.exports = register;