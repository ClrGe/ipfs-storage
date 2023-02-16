// CLG - 2023-02-16 11:00:00 - JMG-Conseil
// Back-end pour la plateforme de dépôt de ressources numériques vers divers supports (IPFS, fs, etc.)
// Version 0.1

const   express = require('express'),
        multer = require('multer'),
        PORT = process.env.PORT,
        MONGO_URI = process.env.MONGO_URI,
        cors = require('cors'),
        fs = require('fs'),
        { MongoClient } = require('mongodb'),
        client = new MongoClient(MONGO_URI),
        upload = multer({ dest: 'lib/files/' }),
        app = express();

let collection;


// -----------------
// --- Middleware ---
// -----------------


app.use(cors(
    {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    }
));


// -----------------
// --- Endpoints ---
// -----------------


// Start the express js server
async function startServer() {
    const db = await connectToMongoDB();

    // endpoint to register a new user
    app.post('/register', async (req: any, res: any) => {
        collection = db.collection('users');
        const user = req.body;
        let result = await collection.insertOne(
            {_id : 'todto', user:  {user}})

        if (result) {
            res.send('ok');
        } else {
            res.send('error');
        }
    });

    // endpoint to login a user
    app.post('/login' , async (req: any, res: any) => {
        collection = db.collection('users');
        console.log(req.body);
        res.send('ok');
    });

    // endpoint to upload a file
    app.post('/upload', upload.single('filepond'), async (req: any, res: any) => {
        if (!req.file) {
            res.status(400).send('No file uploaded.');
            return;
        }
        try {
            console.log(`Received file: ${req.file.path}`);
            await loadToIpfs(req.file);
            return res.status(200).send('File uploaded to IPFS');
        } catch (error) {
            console.error(`Error uploading file to IPFS: ${error}`);
            res.status(500).send(`Error uploading file to IPFS: ${error}`);
        }

    });

    // endpoint to send the list of transactions
    app.get('/files', async (req: any, res: any) => {
        collection = db.collection('files');
        const files = await collection.find().toArray();
        res.send(files);
    });

    // start server
    app.listen(PORT, () => {
        console.log('Server listening on port '+ PORT +'.');
    });
}


// -----------------
// --- Functions ---
// -----------------


// connect to mongodb using native driver
async function connectToMongoDB(){
    await client.connect();
    const db = client.db('depot');
    return db;
}

async function hashPassword(password: string){
    const bcrypt = require('bcrypt');
    const saltRounds = 10;
    const salt = bcrypt.genSaltSync(saltRounds);
    const hash = bcrypt.hashSync(password, salt);
    return hash;
}

async function loadToIpfs(file: any) {
    const fs = require('fs');
    const {create} = await import('ipfs-core');

    if (!fs.statSync(file.path).isFile()) {
        console.error(`Error uploading file to IPFS: '${file.path}' is not a file`);
        return;
    }

    const gateway = 'https://ipfs.io/ipfs/';
    const ipfs = await create(); // Create an IPFS node instance

    const buffer = fs.readFileSync(file.path);
    const result = await ipfs.add(buffer);
    console.log(`'${file.originalname}' uploaded to IPFS: ${gateway}${result.path}`);
    connectToMongoDB().then((db: any) => {
        const collection = db.collection('files');
        collection.insertOne({
            name: file.originalname,
            hash: result.path,
            address: gateway + result.path
        });
    });
}

// -----------------
// --- Start app ---
// -----------------

startServer();