import multer from "multer";
import config from "../config.js";
import { Request, Response } from "express";
import handleError from "../config/mailer.js";
import sharp from "sharp";
import path from "path";
import * as fs from 'fs';
import part from "../model/part.js";

const {PART_IMAGE_DIRECTORY, TEMP_UPLOAD_DIRECTORY} = config

// Save file to temp directory
export const uploadFile = multer({
    dest: TEMP_UPLOAD_DIRECTORY
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
        const targetPath = path.join(PART_IMAGE_DIRECTORY, `${req.file?.originalname!}.webp`)
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