// ---------------------------------------------------------------------------------------------------
// ---------------------------------- CLG - 2023-02-16 - v0.0.1 --------------------------------------
// ------- Back-end pour la plateforme de dépôt de ressources numériques vers divers supports --------
// ---------------------------------------------------------------------------------------------------

require('dotenv').config();

// -----------------
// --- Variables ---
// -----------------

const   PORT            = process.env.PORT,
        MONGO_URI       = process.env.MONGO_URI,
        MONGO_BASE      = process.env.MONGO_BASE,
        GATEWAY         = process.env.IPFS_GATEWAY,
        SMTP_SERVER     = process.env.SMTP_SERVER,
        SMTP_PORT       = process.env.SMTP_PORT,
        SMTP_USER       = process.env.SMTP_USER,
        SMTP_PASSWORD   = process.env.SMTP_PASSWORD,

        cors            = require('cors'),
        cookieParser    = require('cookie-parser'),
        jwt             = require('jsonwebtoken'),
        fs              = require('fs'),
        path            = require('path'),
        bcrypt          = require('bcrypt'),
        nodemailer      = require('nodemailer'),
        { MongoClient } = require('mongodb'),
        multer          = require('multer'),
        express         = require('express');


const   app     = express(),
        saltRounds = 10,
        client  = new MongoClient(MONGO_URI),
        db      = client.db(MONGO_BASE),
        upload  = multer({ dest: 'lib/files/' });

let     collection,
        log: string;

// -----------------
// --- Middleware ---
// -----------------

app.use(cors(
    {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    }
));

app.use(express.json())

app.use(cookieParser())

app.use(express.urlencoded({ extended: true }))

app.use(cors())

// -----------------
// --- Endpoints ---
// -----------------

// Start the express js server
async function startServer() {
    await client.connect();

    // endpoint to register a new user
    app.post('/api/register', async (req: any, res: any) => {
        let collection = db.collection('users');
        console.log(req.body)
        const password = req.body.password;
        bcrypt
            .genSalt(saltRounds)
            .then((salt: any) => {
                console.log('Salt: ', salt)
                return bcrypt.hash(password, salt, (err: any, hash: any) => {
                        console.log('Hash: ', hash)
                        let result = collection.insertOne(
                            {
                                email: req.body.email,
                                password: hash,
                                date: new Date(),
                            },
                        );
                        if (result) {
                            log = `New user registered: `;
                            saveTraces(201, log, 'POST /register');
                            res.status(201).send('ok');
                        } else {
                            log = `Error registering new user: `;
                            saveTraces(500, log, 'POST /register');
                            res.status(500).send('error');
                        }

                    })

                })


            .catch((err: { message: any; }) => console.error(err.message))
    });

    app.post('/api/login' , async (req: any, res: any, next:any) => {
        let collection = db.collection('users');
        const email = req.body.email;
        const password = req.body.password;
        console.log(email, password)

        const user = await collection.findOne({email: email});
        console.log('User: ', user)
        if (user) {
            let data = user.password;
            const compare = await bcrypt.compare(req.body.password, data, (err: any, hash: any) => {
                console.log('Hash: ', hash)
                if(hash === true){
                    console.log('User found')
                    const token = jwt.sign(
                        {
                            email: user.email
                        },
                        'secret',
                        {expiresIn: '1h'});
                    console.log('Token: ', token)
                    res
                        .status(200)
                        .cookie('token',token, { maxAge: 900000, httpOnly: true })
                        .json({success: true, message: "Authentication successful!", token: token});
                } else {
                    console.log('User not found')
                    res.status(401).json({success: false, message: "Invalid credentials"});
                }
                console.log('Compare: ', compare)
            });

        } else {
            console.log('User not found')
            res.status(401).json({success: false, message: "Invalid credentials"});
        }});

    // endpoint to upload a file and save it on the file system
    app.post('/api/fs', upload.single('filepond'), async (req: any, res: any) => {

        const token = req.headers.authorization;

        if(!token) {
            log = 'Failed - No token provided.';
            res.status(401).send('No token provided.');
            await saveTraces(401, log, 'POST /upload');
            return;
        }

        let decode = await verifyToken(token)
        if(!decode){
            console.log("Invalid token")
            res.status(401).json({success:false, message: "Invalid token"});
            return;
        }

        if (!req.file) {
            log = 'Failed - No file uploaded.';
            res.status(400).send('No file uploaded.');
            return;
        }
        try {
            log =`Received file: ${req.file.path}`;
            console.log(log);
            await uploadToFs(req.file);
            await saveTraces(200, log, 'POST /fs');
            return res.status(200).send('File uploaded to fs');
        } catch (error) {
            log = `Error uploading file to fs: ${error}`;
            console.error(log);
            await saveTraces(500, log, 'POST /fs');
            res.status(500).send(log);
        }
    });

    // endpoint to upload a file and send it to ipfs
    app.post('/api/upload', upload.single('filepond'), async (req: any, res: any) => {
        try {
            console.log(`Received file: ${req.file.path}`);
            await loadToIpfs(req.file);
            return res.status(200).send('File uploaded to IPFS');
        } catch (error) {
            log = `Error uploading file to IPFS: ${error}`;
            console.error(log);
            await saveTraces(500, `Could not process: ${req.file.path}`, 'POST /upload');
            res.status(500).send(`Error uploading file to IPFS: ${error}`);
        }
    });

    // endpoint to send the list of transactions
    app.get('/api/transactions', async (req: any, res: any) => {
        let collection = db.collection('transactions');
        const token = req.headers.authorization;
        console.log(token)
        if(!token)
        {
            res.status(401).json({success:false, message: "No token provided"});
            return;
        }
        let decode = await verifyToken(token)
        // if token is expired

        if(decode.includes("invalid")){
            console.log("Invalid token")
            res.status(401).json({success:false, message: "Invalid token"});
            return;
        }
        else{
            const transactions = await collection.find().toArray();
            console.log(log)
            res.status(200).send(transactions);
        }
    });

    // start server
    app.listen(PORT, () => {
        console.log('Server listening on port '+ PORT +'.');
    });
}

// -----------------
// --- Functions ---
// -----------------

async function verifyToken(token: any) {
    token = token.split(' ')[1];
    try {
let user = jwt.verify(token, "secret");
        let result = await db.collection('users').findOne({email:user.email});
        if (result.email != user.email) {
            return 'invalid';
        } else if (result.email === user.email) {
            return 'ok';
        }  else {
            return 'expired';
        }
    } catch (e) {
        if(e instanceof jwt.TokenExpiredError) {
            return 'expired';
          } else if(e instanceof jwt.JsonWebTokenError) {
            return 'invalid';
          } else {
            return 'invalid';
        }
    }

}

async function hashPassword(password:string) {
    await bcrypt.genSalt(10, (err: any, salt: any) => {
        return bcrypt.hash(password, salt, (err: any, hash: any) => {
            if (err) throw err;
        });
    });
}

// compare password
async function comparePassword(plaintextPassword:string, hash:string) {
    const result = await bcrypt.compare(plaintextPassword, hash, (err: any, result: any) => {
        if (err) {
            console.log(err);
        }
        return result;
    }
    );  }

// send email to user from POST request
async function sendEmail(subject: string, message: string, to: string) {
    // use nodemailer to send email
    const transporter = nodemailer.createTransport({
        host: SMTP_SERVER,
        port: SMTP_PORT,
        secure: false,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASSWORD
        },
        tls: {
            rejectUnauthorized: false,
            servername: 'smtp.ethereal.email'
        }
    });

    const email = {
        from: SMTP_USER,
        to: to,
        subject: subject,
        text: message
    }

    transporter.sendMail(email, (err: any, info: any) => {
        if (err) {
            log = `Error sending email: ${err}`;
            console.error(log);
            return;
        }
        log = `Email sent: ${info.response}`;
        console.log(log);
    });

}

// upload directly to file system from POST request
async function uploadToFs(file: any) {

  fs.writeFile(path.join(__dirname, 'lib/files/', file.originalname), file.buffer, (err: any) => {
    if (err) {
        log = `Error uploading file to fs: ${err}`;
        console.error(log);
      return;
    }
    log = `'${file.originalname}' uploaded to fs`;
   });
}

async function loadToIpfs(file: any) {
    let {create} = await import('ipfs-core');

    if (!fs.statSync(file.path).isFile()) {
        log = `Error uploading file to IPFS: '${file.path}' is not a file`;
        console.error(log);
        return;
    }

    const   ipfs = await create(), // Create an IPFS node instance
            buffer = fs.readFileSync(file.path),
            result = await ipfs.add(buffer);

    log = `'${file.originalname}' uploaded to IPFS: ${GATEWAY}${result.path}`;
    console.log(log);

    await db.collection('transactions').insertOne({
        name: file.originalname,
        hash: result.path,
        address: GATEWAY + result.path,
        date: new Date()
    });

}

async function saveTraces(status:number, message:string, origin:string) {
    let collection = db.collection('logs');
    let result = await collection.insertOne(
        {
            status: status,
            message: message,
            origin: origin,
            date: new Date()
        }
    );
}

// -----------------
// --- Start app ---
// -----------------

startServer();
