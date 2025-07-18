//    Core 
const Delay = (msec) => new Promise((resolve) => setTimeout(resolve, msec));
const FileIO = require("fs");
const FileIO_Promises = require('fs/promises');
const Variables = require("./variables");
const Functions = require("./functions");
const Template = require("./template");
const SQL = require("mysql");
const jsdom = require("jsdom");
const path = require("path");
const { JSDOM } = jsdom;

//    Functions
function Data(Server) 
{  
    Server.post("/compile/java", async (req, res) =>
    {
        let result = await Functions.Code_Compile(req.body.code, req.body.input);
        res.send(result);
    });
    
    Server.post("/assignments/get", (req, res) =>
    {
        let query = "SELECT author, id, name, topic, snippet, time, cases FROM assignments ";
        let args = [];

        if (req.body.query)
        {    
            query += "WHERE UPPER(name) LIKE UPPER(?) ";
            query += "OR UPPER(topic) LIKE UPPER(?) ";
            query += "OR UPPER(snippet) LIKE UPPER(?) ";
            args.push("%" + req.body.query + "%");
            args.push("%" + req.body.query + "%");
            args.push("%" + req.body.query + "%");

            query += 
                "ORDER BY CASE " +
                    "WHEN UPPER(topic) LIKE UPPER(?) THEN 1 " + 
                    "WHEN UPPER(name) LIKE UPPER(?) THEN 2 " +
                    "WHEN UPPER(snippet) LIKE (?) THEN 3 " +
                    "ELSE 4 " +
                "END, time DESC;";

            args.push("%" + req.body.query + "%");
            args.push("%" + req.body.query + "%");
            args.push("%" + req.body.query + "%");
        }
        else
        {
            query += "ORDER BY time DESC;";
        }

		Variables.SQLConnection.query(query, args, function(err, row) 
		{
            if (err)
            {
                res.status(500).send();
                console.error(err);
            }
            else 
                res.send(row);
		});
    });

    Server.post("/assignments/get/*", async (req, res) =>
    {
        if (await Functions.Authentication_CheckUser(req.session.device.admin))
        {
            Variables.SQLConnection.query("SELECT * FROM assignments WHERE id='" + req.url.split("/").pop() + "'", function(err, row) 
            {
                if (err)
                {
                    res.status(500).send();
                    console.error(err);
                }
                else if (row && row.length)
                    res.send(row[0]);
                else
                    res.status(404).send("FAIL: Not Found");
            });
        }
        else
        {
            Variables.SQLConnection.query("SELECT author, id, name, topic, problem, time, cases FROM assignments WHERE id='" + req.url.split("/").pop() + "'", function(err, row) 
            {
                if (err)
                {
                    res.status(500).send();
                    console.error(err);
                }
                else if (row && row.length)
                    res.send(row[0]);
                else
                    res.status(404).send("FAIL: Not Found");
            });
        }
    });

    Server.get("/assignments/*", async (req, res, next) =>
    {
        const paths = req.url.split("/").filter(o => o != "");

        if (paths.length == 2 && isNaN(paths[1]) == false)
            res.redirect("/assignments/code?id=" + paths[1]);
        else
            next();
    });

    Server.get("/admin/assignments/*", async (req, res, next) =>
    {
        const paths = req.url.split("/").filter(o => o != "");

        if (req.url.startsWith("/admin/assignments/edit"))
        {
            let id = paths[2].replace("edit?id=", "");
            let assignment = await Functions.Assignment_Details(id, true);
            
            if (assignment.id)
                Functions.Administrator_Log(req.session.device.admin, "view", assignment.name, null, id);
        }

        if (paths.length == 3 && isNaN(paths[2]) == false)
            res.redirect("/admin/assignments/edit?id=" + paths[2]);
        else
            next();
    });

    Server.get("/admin/auditlog/get", async (req, res) => 
    {
        let logs = await Functions.Administrator_GetAllLog();
        res.send(logs);
    });

    Server.get("/assignments/test/*", (req, res) =>
    {
        Variables.SQLConnection.query("SELECT inputs, outputs FROM assignments WHERE id='" + req.path.split("/").pop() + "'", async function(err, row) 
        {   
            if (err)
            {
                res.status(500).send();
                console.error(err);
            }
            else if (row && row.length)
            {
                res.writeHead(200, 
                {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });
                
                let inputs = row[0].inputs.split(";").filter(Boolean).map(o => o.trim());
                let outputs = row[0].outputs.split(";").filter(Boolean).map(o => o.trim());
                
                for (let i = 0; i < inputs.length; i++)
                {
                    let result = await Functions.Code_Compile(req.query.code, inputs[i]);
                    
                    res.write("event: message\n");
                    if (result.error || !outputs[i] || !result.output)
                    {
                        res.write("data: " + JSON.stringify({number: i + 1, status: "ERROR", error: result.error}) + "\n\n");
                    }
                    else
                    {
                        let output1 = [];
                        let output2 = [];

                        for (let o of result.output.split("\n"))
                            output1.push(o.trim());
                        result.output = output1.join("\n");
                        
                        for (let o of outputs[i].split("\n"))
                            output2.push(o.trim());
                        outputs[i] = output2.join("\n");

                        if (result.output.trim() == outputs[i])
                            res.write("data: " + JSON.stringify({number: i + 1, status: "OK"}) + "\n\n");
                        else
                            res.write("data: " + JSON.stringify({number: i + 1, status: "WRONG"}) + "\n\n");
                    }
                }

                res.write("event: message\n");
                res.write("data: DONE\n\n");
                res.end();
            }
            else
                res.status(404).send("FAIL: Not Found");
        });
    });

    Server.post("/assignments/create", async (req, res) =>
    {
        if (await Functions.Authentication_CheckUser(req.session.device.admin))
        {
            let id = Date.now().toString(), 
                time = Date.now().toString(), 
                author = (await Functions.Authentication_GetUserDetails(req.session.device.admin)).username,
                name = req.body.name, 
                topic = req.body.topic, 
                problem = "", 
                snippet = "", 
                inputs = "", 
                outputs = "",
                cases = "0";
    
            Variables.SQLConnection.query(
                "INSERT INTO assignments" + 
                "(id, time, author, name, topic, problem, snippet, inputs, outputs, cases) VALUES " +
                "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [id, time, author, name, topic, problem, snippet, inputs, outputs, cases],
            function(err)
            {
                if (err)
                {
                    res.status(500).send();
                    console.error(err);
                }
                else
                    res.send(id);
            });

            Functions.Administrator_Log(req.session.device.admin, "create", name, null, id);
        }
        else
        {
            res.status(403).send("FAIL: No permission to access");
        }
    });
    
    Server.post("/assignments/update", async (req, res) =>
    {
        let assignment = await Functions.Assignment_Details(req.body.id, true);

        if (await Functions.Authentication_CheckUser(req.session.device.admin))
        {
            let id = req.body.id, 
                name = req.body.name.trim(), 
                topic = req.body.topic.trim(),
                problem = req.body.problem.trim(), 
                inputs = req.body.inputs.trim(), 
                outputs = req.body.outputs.trim(),
                snippet = "",
                cases = inputs.split(";").filter(Boolean).length;

            if (problem != "")
            {
                const dom = new JSDOM("<!DOCTYPE html><div id='main'>" + problem.replace(/\>\</g, ">&nbsp;<") + "</div>");
                snippet = dom.window.document.querySelector("#main").textContent.replace(/\xa0/g, "\n");
                snippet = snippet.replace(/\n\n/g, "\n");
                
                if (snippet.toLowerCase().indexOf("spesifikasi masukan") > -1)
                    snippet = snippet.substring(0, snippet.toLowerCase().indexOf("spesifikasi masukan"));
                else if (snippet.toLowerCase().indexOf("spesifikasi input") > -1)
                    snippet = snippet.substring(0, snippet.toLowerCase().indexOf("spesifikasi input"));

                snippet = snippet.trim();

                if (snippet.length > 800)
                    snippet = snippet.substring(0, 800);
            }

            Variables.SQLConnection.query(
                "UPDATE assignments SET name=?, topic=?, problem=?, snippet=?, inputs=?, outputs=?, cases=? WHERE id = ?",
            [name, topic, problem, snippet, inputs, outputs, cases, id],
            async function (err, result)
            {
                if (err)
                {
                    res.status(500).send();
                    console.error(err);
                }
                else 
                {
                    if (name != "" && name != assignment.name)
                        Functions.Administrator_Log(req.session.device.admin, "rename", assignment.name, name, id);
                    
                    if (
                        (problem != "" && problem != assignment.problem) ||
                        (topic != "" && topic != assignment.topic) ||
                        (inputs != "" && inputs != assignment.inputs) ||
                        (outputs != "" && outputs != assignment.outputs)
                    )
                        Functions.Administrator_Log(req.session.device.admin, "update", name || assignment.name, null, id);
                    
                    res.send("OK");
                }
            });
        }
        else
        {
            res.status(403).send("FAIL: No permission to access");
        }
    });

    Server.post("/assignments/delete", async (req, res) =>
    {
        let assignment = await Functions.Assignment_Details(req.body.id, true);
        if (await Functions.Authentication_CheckUser(req.session.device.admin))
        {
            let id = req.body.id;
            
            Variables.SQLConnection.query("DELETE FROM assignments WHERE id = ?",
            [id],
            function(err)
            {
                if (err)
                {
                    res.status(500).send();
                    console.error(err);
                }
                else
                {
                    res.send("OK");
                    Functions.Administrator_Log(req.session.device.admin, "delete", assignment.name, null, null);
                }
            });
        }
        else
        {
            res.status(403).send("FAIL: No permission to access");
        }
    });
}

module.exports = Data;