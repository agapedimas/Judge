const SQL = require("mysql");
const Delay = (msec) => new Promise((resolve) => setTimeout(resolve, msec));

const Variables = 
{
	WebRoot: "./web",
	WebHomepage: "/",
	AppTitle: "Judge",
	Version: "1.3.7",

	AdminUsername: [],
	ActiveUser: [],

    Production: (process.env.NODE_ENV == "production"),
    SQL:
    {
    	connectionLimit: 10,
    	host: "localhost",
    	port: 3306,
    	user: process.env.AD_SQL_USERNAME,
    	password: process.env.AD_SQL_PASSWORD,
    	database: "agapedim_judge",
		charset: "utf8mb4",
    	createDatabaseTable: true
    },
    SQLConnection: null
}

Variables.Connect = async function()
{
	return new Promise(async function(resolve)
	{
		for (let i = 1; i <= 60; i++)
		{
			Variables.SQLConnection = SQL.createConnection(Variables.SQL);
			let done = await new Promise(async res => 
			{
				Variables.SQLConnection.connect(function(err)
				{
					if (err) 
					{
						if (err.code == "ECONNREFUSED")
						{
							res(false);
						}
						else
						{
							console.error("Error when connecting to database:\n", err);
							process.exit();
						}
					}   
					else
					{
						res(true);
					}   
				})
			});	
	
			if (done)
				break;
			else
				await Delay(1000 * i);
		}
	
		Variables.SQLConnection.on("error", function(err) 
		{
			if (err.code === "PROTOCOL_CONNECTION_LOST")
				Variables.Connect();
			else if (err.code === "ETIMEDOUT")
				Variables.Connect();
			else if (err.code === "UND_ERR_CONNECT_TIMEOUT")
				Variables.Connect();
			else 
				throw err;
		});

		resolve();
	});
}


Variables.WebPing = Variables.Production ? "https://judge.agapedimas.com/ping" : "http://localhost:17194/ping";
Variables.AppAssets = Variables.Production ? "https://assets.agapedimas.com" : "http://localhost:1202";
Variables.AppIcon =  Variables.AppAssets + "/icon_logo.ico";

module.exports = Variables;