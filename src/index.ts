// ---------------------------------------------------------------------------------------------------
// ---------------------------------- CLG - 2023-02-16 - v0.0.1 --------------------------------------
// ------- Back-end pour la plateforme de dépôt de ressources numériques vers divers supports --------
// ---------------------------------------------------------------------------------------------------

const   PORT            = process.env.PORT,
        MONGO_URI       = process.env.MONGO_URI,
        MONGO_BASE      = process.env.MONGO_BASE,
        GATEWAY         = process.env.IPFS_GATEWAY,
        cors            = require('cors'),
        fs              = require('fs'),
        path            = require('path'),
        bcrypt          = require('bcrypt'),
        { MongoClient } = require('mongodb'),
        client          = new MongoClient(MONGO_URI),
        multer          = require('multer'),
        upload          = multer({ dest: 'lib/files/' }),
        express         = require('express'),
        app             = express();

const db = client.db('depot');

let collection,
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

// -----------------
// --- Endpoints ---
// -----------------

// Start the express js server
async function startServer() {
    await client.connect();

    // endpoint to register a new user
    app.post('/register', async (req: any, res: any) => {
        let collection = db.collection('users');
        const user = req.body;
        let result = await collection.insertOne(
            {_id : 'todto', user:  {user}})

        if (result) {
            log = `New user registered: ${user.email}`;
            await saveTraces(201, log, 'POST /register');
            res.status(201).send('ok');
        } else {
            log = `Error registering new user: ${user.email}`;
            await saveTraces(500, log, 'POST /register');
            res.status(500).send('error');
        }
    });

    // endpoint to login a user
    app.post('/login' , async (req: any, res: any) => {
        collection = db.collection('users');
        log = `Login attempt from ${req.body.email} `;
        console.log(log);
        await saveTraces(200, log, 'POST /login');

        res.status(200).send('ok');
    });

    // endpoint to upload a file and save it on the file system
    app.post('/fs', upload.single('filepond'), async (req: any, res: any) => {
        if (!req.file) {
            log = 'Failed - No file uploaded.';
            res.status(400).send('No file uploaded.');
            await saveTraces(400, log, 'POST /fs');
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
    app.post('/upload', upload.single('filepond'), async (req: any, res: any) => {
        if (!req.file) {
            log = 'Failed - No file uploaded.';

            res.status(400).send('No file uploaded.');
            return;
        }
        try {
            console.log(`Received file: ${req.file.path}`);
            await loadToIpfs(req.file);
            return res.status(200).send('File uploaded to IPFS');
        } catch (error) {
            log = `Error uploading file to IPFS: ${error}`;
            console.error(log);
            await saveTraces(500, log, 'POST /upload');
            res.status(500).send(`Error uploading file to IPFS: ${error}`);
        }
    });

    // endpoint to send the list of transactions
    app.get('/transactions', async (req: any, res: any) => {
        let collection = db.collection('transactions');
        const transactions = await collection.find().toArray();
        log = `Transactions sent: ${transactions}`;
        await saveTraces(200, log, 'GET /transactions');
        res.status(200).send(transactions);
    });

    // start server
    app.listen(PORT, () => {
        console.log('Server listening on port '+ PORT +'.');
    });
}


// -----------------
// --- Functions ---
// -----------------



async function hashPassword(password: string){
    const   saltRounds  = 10,
            salt        = bcrypt.genSaltSync(saltRounds);

    return bcrypt.hashSync(password, salt);
}

// upload to IPFS directly from POST request
async function uploadToIpfs(file: any) {
    let {create} = await import('ipfs-core');

    const   ipfs    = await create(), // Create an IPFS node instance
            result  = await ipfs.add(file);

    log = `'${file.originalname}' uploaded to IPFS: ${GATEWAY}${result.path}`;

    await db.collection('transactions').insertOne({
        name: file.originalname,
        hash: result.path,
        address: GATEWAY + result.path
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

    const   gateway = 'https://ipfs.io/ipfs/',
            ipfs = await create(), // Create an IPFS node instance
            buffer = fs.readFileSync(file.path),
            result = await ipfs.add(buffer);

    log = `'${file.originalname}' uploaded to IPFS: ${gateway}${result.path}`;
    console.log(log);

    await db.collection('transactions').insertOne({
        name: file.originalname,
        hash: result.path,
        address: gateway + result.path
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