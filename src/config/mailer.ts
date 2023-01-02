import { MongooseError } from 'mongoose'
import nodemailer from 'nodemailer'
import { Options } from 'nodemailer/lib/mailer/index.js'
import config from '../config.js'

const handleError = (error: Error | MongooseError | string) => {
  if (config.DEBUG) {
    console.log(error)
  } else {
    let user = process.env.EMAIL 
    let pass = process.env.EMAIL_PASS
      let transporter = nodemailer.createTransport({
        service: 'Outlook365',
        auth: {
          user,
          pass
        }
      });
      let errorDate = new Date(Date.now())
      let mailOptions = {
        from: process.env.EMAIL,
        to: process.env.DEV_EMAIL,
        subject: `Error at ${errorDate.toTimeString()}`,
        text: error
      };
      transporter.sendMail(mailOptions as Options, function(error, info){
        if (error) {
          console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      }); 
    }
  }

export default handleError