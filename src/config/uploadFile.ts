import multer from "multer";
import config from "../config.js";
import { Request, Response } from "express";
import handleError from "../config/mailer.js";
import sharp from "sharp";
import path from "path";
import * as fs from 'fs';
import part from "../model/part.js";
import user from "../model/user.js";
import mongoose from "mongoose";

const {UPLOAD_DIRECTORY} = config

// Save file to temp directory
export const uploadImage = multer({
    dest: path.join(UPLOAD_DIRECTORY, 'temp')
}).single("file")


export async function updatePartImage (req: Request, res: Response) {
    try {
        // Save the temp path of image
        const tempPath = req.file?.path
        // Get original name
        const originalName = req.file?.originalname
        // Check if part exists or name is invalid
        if(!part.exists({nxid: originalName })||!/PNX([0-9]{7})+/.test(originalName!))
            return res.status(400).send("Invalid request")
        // Target path
        const targetPath = path.join(UPLOAD_DIRECTORY, 'images/parts', `${req.file?.originalname!}.webp`)
        // Resize and convert image
        await sharp(tempPath)
        .resize(600)
        .webp()
        .toFile(targetPath)
        fs.unlinkSync(tempPath!)
        // Done
        res.status(200).send("Success")
    } catch (err) {
        // Database error
        handleError(err)
        res.status(500).send("API could not handle your request: " + err);
    }
}

export async function updateUserImage (req: Request, res: Response) {
    try {
        // Save the temp path of image
        const tempPath = req.file?.path
        // Get original name
        const originalName = req.file?.originalname as string
        // Check if part exists or name is invalid
        if(!user.exists({nxid: originalName })||!mongoose.Types.ObjectId.isValid(originalName))
            return res.status(400).send("Invalid request")
        // Target path
        const targetPath = path.join(UPLOAD_DIRECTORY, 'images/users', `${req.file?.originalname!}.webp`)
        // Resize and convert image
        await sharp(tempPath)
        .resize({width: 512, height: 512})
        .webp()
        .toFile(targetPath)
        fs.unlinkSync(tempPath!)
        // Done
        res.status(200).send("Success")
    } catch (err) {
        // Database error
        handleError(err)
        res.status(500).send("API could not handle your request: " + err);
    }
}