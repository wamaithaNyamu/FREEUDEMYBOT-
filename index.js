//require puppeteer
const puppeteer = require("puppeteer");
const {MongoClient} = require('mongodb');
const cron = require("node-cron");
require("dotenv").config();
let nodeMailer = require("nodemailer");
let EmailTemplate = require('email-templates').EmailTemplate;
//page that has 100% coupon curations
let references = '';
let MONGOURI = process.env.MONGOURI ;
let GMAILEMAIL = process.env.GMAILEMAIL ;
let GMAILPASSWORD =process.env.GMAILPASSWORD;
let messageIdPrefix =process.env.messageIdPrefix;
let messageId = messageIdPrefix + '@gmail.com';
const couponsPage = "https://udemycoupon.learnviral.com/coupon-category/free100-discount/";


//get browser instance
async function getBrowser() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process'
        ]
    });
    return browser;
}

//scrape url on first page
async function scrapeFreeCouponUrls(browser) {
    //stores all urls
    const allLinks = [];
    const page = await browser.newPage();
    await page.goto(couponsPage);
    console.log("Urls are being scraped");
    const allUrls = await page.$$eval('.entry-title > a', links => links.map(link => link.href));
    for (let aUrl of allUrls) {
        allLinks.push(aUrl);
        console.log("Links:", aUrl);
    }
    return allLinks;
    try {

    } catch (e) {
        console.log("This error is coming from the scrapeFreeCouponUrls function", e);
    }

}

//store to mongo db
async function connectMongo(allLinks) {
    const enrollLink = [];
    try {
        const mongoUri = MONGOURI;
        const client = new MongoClient(mongoUri);
        await client.connect();
        console.log("Waiting after connecting to mongo");
         //store the urls
        for (let url of allLinks) {
            console.log("In the connect mongo for loop");
            let query = {
                "_id": url,
            }
            let insertLink = {
                $setOnInsert: {
                    "_id": url,

                }
            }
            await client.db("udemybotDB").collection("udemybotCol").updateOne(query, insertLink, {upsert: true})
                .then(result => {
                    // console.log(result);
                    const {upsertedId} = result;
                    if (upsertedId) {
                        const insertedLinks = result['upsertedId']["_id"];
                        console.log("Inserted link", insertedLinks);
                        enrollLink.push(insertedLinks);

                    } else {
                        console.log("no link to mongo ");
                    }
                });
        }
        await client.close();
        return enrollLink;
    } catch (e) {
        console.log("This error is coming from connectMongo function", e);
    }
}

//transporter
function sendmail(email, udemyUrls) {
    let transporter = nodeMailer.createTransport(GMAILEMAIL + ':' + GMAILPASSWORD + '@smtp.gmail.com');
    let sendUdemyCoupons = transporter.templateSender(
        new EmailTemplate('./templates/udemy'), {
            from: 'achieleyemo@gmail.com',
        });
        // transporter.template
        console.log("in email me");
            sendUdemyCoupons({
            to: email,
            messageId: messageId,
            inReplyTo: messageId,
            references: references,
            headers: {
                References: `${references} ${messageId}`,
                'In-Reply-To': messageId
            },
            subject: 'NEW FREE UDEMY COURSES',
        }, {
            token: udemyUrls
        }, function (err, info) {
            if (err) {

                console.log(err)
            } else {
                console.log('Link sent\n'+ JSON.stringify(info));
        }
    });
};

async function main() {
    try {
        const browser = await getBrowser();
        const allLinks = await scrapeFreeCouponUrls(browser);
        console.log("Waiting before connecting to mongo");
        await new Promise(resolve => setTimeout(resolve, 10000));

        const urls = await connectMongo(allLinks);
        await new Promise(resolve => setTimeout(resolve, 20000));

        if (urls.length === 0) {
            console.log("no new links so we terminate the programme");
            //  await process.exit();


        } else {
            await new Promise(resolve => setTimeout(resolve, 5000));
            console.log("Waiting before sending emails");
            for (let name of process.env.emailClients.split(',')) {
                console.log("Sending email to:", name);
                sendmail(name ,urls );
                // await new Promise(resolve => setTimeout(resolve, 1000));

            }            ;

            console.log("Waiting before terminating emails closing smtp");
            //await process.exit();
        }

    } catch (e) {
        console.log("This error is from the main", e);
    }
}

//run cron job every thirty minutes
cron.schedule("0 */30 * * * *", ()=>{
    console.log("_____________running cron job_-----------------");
    main();
});
