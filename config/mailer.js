var nodemailer = require('nodemailer')

const handleError = (error, req) => {
    console.log(error)
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
        text: error + "\n\n\n" + JSON.stringify(req.user) + "\n\n\n" + JSON.stringify(req.query)  + "\n\n\n" + JSON.stringify(req.body)
      };
      transporter.sendMail(mailOptions, function(error, info){
        if (error) {
          console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      }); 
}

module.exports = handleError