#!/usr/bin/env node

const { program } = require('commander');
const { upload } = require('./uploader');
const { download } = require('./downloader');

program
    .name('dcs-cli')
    .description('Distributed Cloud Storage CLI Client')
    .version('0.1.0');

program
    .command('upload <file>')
    .description('Upload a file to the distributed storage')
    .action(async (file) => {
        try {
            await upload(file);
        } catch (err) {
            console.error('Upload failed:', err.message);
            process.exit(1);
        }
    });

program
    .command('download <fileId>')
    .description('Download a file from the distributed storage')
    .option('-o, --output <path>', 'Output file path')
    .action(async (fileId, opts) => {
        try {
            await download(fileId, opts.output);
        } catch (err) {
            console.error('Download failed:', err.message);
            process.exit(1);
        }
    });

program.parse();
