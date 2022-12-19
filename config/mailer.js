var nodemailer = require('nodemailer')

const handleError = (error) => {
  if (process.env.DEBUG === "true") {
    console.log(error)
  } else {
    let user = process.env.EMAIL 
    let pass = process.env.EMAIL_PASS
      let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass
        }
      });
      let errorDate = new Date(Date.now())
      let mailOptions = {
        from: process.env.EMAIL,
        to: process.env.EMAIL,
        subject: `Error at ${errorDate.toTimeString()}`,
        text: error
      };
      transporter.sendMail(mailOptions, function(error, info){
        if (error) {
          console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      }); 
    }
  }

module.exports = handleError