console.log("Getting ready: " + new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));

//    Core 
const Delay = (msec) => new Promise((resolve) => setTimeout(resolve, msec));
const FileIO = require("fs");
const Variables = require("./variables");
const Functions = require("./functions");
const Template = require("./template");
const Data = require("./data");


//    Server
const Express = require("express");
const Server = Express();
const Session = require("express-session");
const MySQLStore = require("express-mysql-session")(Session);
const BodyParser = require("body-parser");

//    Configure
Configure();

async function Configure()
{
    await Variables.Connect();
    await Template.Initialize();
	
    const Session_Store = new MySQLStore(Variables.SQL);
    
    Server.use(BodyParser.urlencoded({ limit: "50mb", extended: true }));
    Server.use(BodyParser.json({ limit: "50mb" }));
    Server.set("trust proxy", true);
    Server.use(Session({
    	secret: process.env.AD_API_KEY,
    	saveUninitialized: false,
    	cookie: 
    	{ 
            httpOnly: "auto",
            secure:  "auto",
    		maxAge: 12 * 30 * 24 * 60 * 60 * 1000
    	},
        store: Session_Store,
    	resave: false 
    }));
    Server.use(async (req, res, next) => 
    {
    	if (req.session != null)
    	{
    		if (req.session.device == null)
    		{
    			req.session.device =
    			{
    				"user": {},
    				"admin": {}
    			};
    		}
    	}
    	const file = 
    	{
    		icons: /\.(?:ico)$/i,
    		fonts: /\.(?:ttf|woff2)$/i,
    		images:/\.(?:png|webp|jpg|jpeg|bmp)$/i
    	}
    	
    	for (const [key, value] of Object.entries(file)) 
    	{
    		if (value.test(req.url) && req.query.cache != "false")
    			res.header("Cache-Control", "public, max-age=604800"); // 7 days
			else
			{
				res.header("Cache-Control", "no-cache, no-store, must-revalidate");
				res.header("Pragma", "no-cache");
				res.header("Expires", "0");
			}
    	}
    	
      next();
    });
    
	Data(Server);
    Functions.Authentication_Configure();
    Functions.Server_Map(Server);
    Functions.Server_Start(Server);
}

