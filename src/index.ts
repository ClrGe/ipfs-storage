const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');

// Create a new express application instance

const app = express();
const upload = multer({ dest: 'lib/files' });

let PORT = 3000;

const corsOptions = {
    origin: 'http://localhost:5173'
}

app.use(cors(
    {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    }
));
// Start the express js server
async function startServer() {
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

    // endpoint to retrieve content of collection 'files' from mongodb
    app.get('/files', async (req: any, res: any) => {
        const db = await connectToMongoDB();
        const collection = db.collection('files');
        const files = await collection.find().toArray();
        res.send(files);
    });

    app.post('/test', cors(corsOptions), async (req: any, res: any) => {
        if (!req.files || Object.keys(req.files).length === 0) {
            console.log('No files were uploaded.' + req.files);
            return res.status(400).send('No files were uploaded.');
        }

        const url = await loadToIpfs(req.files.file);
        console.log(`File uploaded to IPFS: ${url}`);
        res.send(`File uploaded to IPFS: ${url}`);
    });


    app.listen(PORT, () => {
        console.log('Server listening on port '+ PORT +'.');
    });
}

// connect to mongodb using native driver
async function connectToMongoDB(){
    const { MongoClient } = require('mongodb');
    const uri = 'mongodb://localhost:27017';
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('depot');
    return db;
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





startServer();