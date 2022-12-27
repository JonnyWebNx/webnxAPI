import { Request, Response } from "express";

const isAuth = async (req: Request, res: Response) => {
    // User was authenticated through token
    res.status(200).send(req.user);
}
export default isAuth;
