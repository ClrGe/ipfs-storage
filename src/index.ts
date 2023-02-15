const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer({ dest: 'lib/files' });

let PORT = 3000;

interface File {
    filename: string;
    data: Buffer;
    size: number;
}

// Start the express js server
async function startServer() {

    app.post('/upload', async (req: any, res: any) => {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).send('No files were uploaded.');
        }

        const url = await loadToIpfs(req.files.file);
        res.send(`File uploaded to IPFS: ${url}`);
    });


    app.listen(PORT, () => {
        console.log('Server listening on port '+ PORT +'.');
    });
}

// Upload files to IPFS
async function loadToIpfs(file:File) {
    const { create } = await import('ipfs-core');
    const ipfs = await create(); // Create an IPFS node instance
    const buffer = file.data;
    const result = await ipfs.add(buffer);
    const gateway = 'https://ipfs.io/ipfs/';
    const url = `${gateway}${result.path}`;

    console.log(`File uploaded to IPFS: ${url}`);

    return url;
}

startServer();