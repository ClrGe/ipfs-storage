async function main() {

    const fs = await import('fs')

    const   filesDir    = 'src/lib/files',
        files       = fs.readdirSync(filesDir),
        gateway     = 'https://ipfs.io/ipfs/';

    const { create } = await import('ipfs-core');
    const ipfs = await create(); // Create an IPFS node instance

    for(let file of files) {
        const result = await ipfs.add(file)
    }
}

main()