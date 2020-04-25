//----------------------------------------------------------------------------------------------
//require mongoose - used for writing to mongodb in node js
const mongoose = require('mongoose');
//requite the configuration variables from the .env file.
require("dotenv").config();
//headless browser driver
const puppeteer = require("puppeteer");
//sends emails from node
const nodeMailer = require("nodemailer");
//allows integration of beautiful templates in the email
const EmailTemplate = require('email-templates').EmailTemplate;

//----------------------------------------------------------------------------------------------
//variables used in nodemailer
let references = '';
let GMAILEMAIL = process.env.GMAILEMAIL ;
let GMAILPASSWORD =process.env.GMAILPASSWORD;
let messageIdPrefix =process.env.messageIdPrefix;
let messageId = messageIdPrefix + '@gmail.com';
//----------------------------------------------------------------------------------------------

//GLOBAL VARIABLES
//appends array to be used to send emails
// TODO: avoid global variables
const toBeEmailed=[];
//page we will be extracting emails
const couponsPage = "https://udemycoupon.learnviral.com/coupon-category/free100-discount/";

//----------------------------------------------------------------------------------------------

//initiate browser, open new page and go to url then return page
async function getBroswer(){
    try{
        console.log("in get page");
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox',
                '--disable-setuid-sandbox',

            ]
        });

        return browser
    }catch (e) {
        console.log("this error is coming from the getBroswer func", e);
    }
}

//------------------------------------------------------------------------------------------------------
//disable js, fonts, images
async function interceptRequests(page){
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        if (['image', 'stylesheet', 'font', 'script'].indexOf(request.resourceType()) !== -1) {
            request.abort();
        } else {
            request.continue();
        }
    });
}




//------------------------------------------------------------------------------------------------------------------------
//scrapes all urls from the coupons page
async function scrapeFreeCouponUrls() {
    try {
        const browser = await getBroswer();
        const page = await browser.newPage();
        await interceptRequests(page);
        await page.goto(couponsPage,{ timeout: 30000});
        console.log("Urls are being scraped");
        const allUrls = await page.$$eval('.entry-title > a', links => links.map(link => link.href));
        console.log('urls from first page',allUrls );
        await browser.close();
        return allUrls;//return all urls from coupons page


    } catch (e) {
        console.log("This error is coming from the scrapeFreeCouponUrls function", e);
    }

}
//----------------------------------------------------------------------------------------------

//MONGOOSE
//schema for what we will post
const udemySchema = new mongoose.Schema({
    firstLink: {
        type: String,
        required: [true, 'Username is required']
    },
    udemyLink: {
        type: String,
        required: [true]
    },
    timeAndDuration: {
        type: String,
        required: [true]
    },
    Description: {
        type: String,
        required: [true]
    },
    tags: {
        type: String,
        required: [true]
    },
    date:{
        type: Date,
        required: [true]
    }


});

//mongoose model
const POST = mongoose.model('udemyUrls', udemySchema, 'udemyUrls');
//uri from mongodb Atlas stored in env
let MONGOURI = process.env.MONGOURI1 ;


//----------------------------------------------------------------------------------------------
//creates a new document entry
async function createPost(firstLink,udemyLink,timeAndDuration, Description , tags) {
    return new POST({
        firstLink,
        udemyLink,
        timeAndDuration,
        Description,
        tags,
        date : Date.now()
    }).save()
}


//----------------------------------------------------------------------------------------------
//creates a connection to Mongo db
async function connectMongo(){
    const connector = mongoose.connect(MONGOURI,{
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    return connector;
}


//----------------------------------------------------------------------------------------------
//checks if given link is in mongo, returns a boolean. If true the link is in db if false not in db
async function findIfFirstLinkinDB(firstLink) {
    console.log("checking if in db");
    let connector = await connectMongo();
    return await POST.findOne({ firstLink });

};

//----------------------------------------------------------------------------------------------
//returns only urls not found in mongo after they were scrapped from coupons page
async function toBeSentEmails(){
    const theUrlsFromFirstLink = await scrapeFreeCouponUrls();
    const toBesent=[]
    for (let url of theUrlsFromFirstLink){
        let test = await findIfFirstLinkinDB(url);
        if(!test){
            toBesent.push(url)
        }
    }
    if(!toBesent){
        console.log("No new links, killing process");
        process.kill(0);
    }
    console.log("LINKS NOT IN MONGO:", toBesent);
    return toBesent
}


//--------------------------------------------------------------------------------
//takes links not in mongo from  the func above and stores them
async function determineLinkToGetUdemyLink(){
    const urlsStored = await toBeSentEmails()
    for (let url of urlsStored){
        await StoretoMongo(url);
    }
    console.log("done");

}

//--------------------------------------------------------------------------------
//goes to individual url not in mongo and scrapes the descriptions and direct udemy link
async function gotoPageWithUdemyurl(url){
    try{
        //in individual link
        const browser = await getBroswer();
        const page = await browser.newPage();
        await interceptRequests(page);
        await page.goto(url,{ timeout: 30000});

        //get udemy link
        const udemyLink = await page.$$eval('.link-holder > a', links => links.map(link => link.href));
        const timeDesc = await page.$eval('.text-box  p', (descs => descs.textContent));
        const timeAndDuration = timeDesc.replace(/[//]/g, '');//strips // from string
        const Description = await page.$eval('.text-box  p:nth-child(3)', (descs => descs.textContent));//extractsdescription
        const atags = await page.$$eval('.tags > a', links => links.map(link => link.innerHTML));//extracts tags
        const tags = atags.join(); // forms a single string
        const fullArray = [url,udemyLink, timeAndDuration, Description, tags];
        await toBeEmailed.push(fullArray)//appends an array of scraped data from url
        await browser.close();

        return fullArray;
    }catch (e) {
        console.log("this error is coming from the gotoPageWithUdemyurl func", e);
        process.exit()
    }
}


//--------------------------------------------------------------------------------
//stores links to mongo after getting back descriptions from the gotoPageWithUdemyurl func

async function StoretoMongo(url) {
    try {
        console.log("storing in mongo")
        await connectMongo();
        const fullLinks =await gotoPageWithUdemyurl(url,{ timeout: 30000});
        await createPost(fullLinks[0],fullLinks[1][0],fullLinks[2],fullLinks[3],fullLinks[4]);
        console.log("mongose round");

    }catch (e) {
        console.log("error in mongoose",e);
    }
}


//--------------------------------------------------------------------------------
// node mailer transporter
function sendmail(email){
    try{
        console.log("in emails");
        // console.log("to be emailed:", toBeEmailed);
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
        },{
            toBeEmailed:toBeEmailed,
        },  function (err, info) {
            if (err) {

                console.log(err)
            } else {
                console.log('Link sent\n'+ JSON.stringify(info));
            }
        });

    }catch (e) {

    }
};
//----------------------------------------------------------------------
//close browser


//----------------------------------------------------------------------
//where all the magic happens
async function main() {
    try {
        await determineLinkToGetUdemyLink();
        for (let name of process.env.emailClients.split(',')) {
            console.log("Sending email to:", name);
            await sendmail(name);
        }
        console.log("bye bye");
    }catch (e) {
        console.log("error in main",e);
    }
}

//call main
main();


//----------------------------------------------------------------------------------------------
//TODO:concurrency, multithreading, redis,
//TODO:send email by desired category using tags
//TODO:different templates different category

