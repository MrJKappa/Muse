//-----------------------------APIs------------------------------------
const express = require('express'); // Express web server framework
const request = require('request'); // "Request" library
const jquery = require('jquery');
const cors = require('cors');
const session = require('express-session');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const SpotifyWebApi = require('spotify-web-api-node'); //spotify API
var giphy = require('giphy-api')('Y56mTvFIxqSUzVbpyJrhjH9bA4VKxe2P'); //giphy API
const mysql = require('mysql');
'use strict';
const sessionStorage = require('sessionstorage');
const pool = dbConnection();
const fetch = require("node-fetch");
//-----------------------------------------------------------------------

//---------------------------------------------------------------------
const app = express();
app.set("view engine", "ejs");
app.use(express.static(__dirname + '/public'));
app.use(express.urlencoded({extended:true}));
app.set('trust proxy', 1) // trust first proxy
app.use(session({
  secret: 'topsecret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true }
}))

//---------------------------------------------------------------------
app.use(express.urlencoded({extended: true}));
//---------------------------Client-Info------------------------------
// var client = require('./public/client');
var client_id = 'CLIENT_ID';
var client_secret = 'CLIENT_SECRET';
var redirect_uri = 'CALLBACK_URI'; 
var stateKey = 'spotify_auth_state';
// credentials are optional
var spotifyApi = new SpotifyWebApi({
  clientId: client_id,
  clientSecret: client_secret,
  redirectUri: redirect_uri
});

//---------------------------------------------------------------------

//---------------------------Cookies-----------------------------------
/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};


app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());
//---------------------------------------------------------------------

//---------------------------Routes------------------------------------ 
app.get("/", async function(req, res){
  var gif = await giphy.random('music');
  let q = await randomQuote()
  res.render("landingPage", {"gif": gif.data, "q":q});
});

app.get("/home", async function(req, res){
  /*TODO
  - CHANGE ALBUM/PLAYLIST/SONGS TO SHOW GENRES
  */
  var user = sessionStorage.getItem(req.sessionID);
  var spotify = new SpotifyWebApi();
  spotify.setAccessToken(user[0].access_token);
  spotify.setRefreshToken(user[0].refresh_token);
  
  const accountData = await spotify.getMe();
  var num = Math.floor(Math.random() * 5)+1;
  const songData = await spotify.getMySavedTracks({limit : 10, offset: num});
  const albumData = await spotify.getMySavedAlbums({limit : 5, offset: 0});

  let sql1 = `SELECT id FROM tbllogin JOIN tblpost WHERE id = "${user[0].id}"`;
  let row1 = await executeSQL(sql1);
  id = row1[0].id;
  
  let sql2 = `SELECT tblpost.*,DATE_FORMAT(tblpost.date, '%Y-%m-%d') dateISO, username from tblpost INNER JOIN tbllogin on id = posterID WHERE posterID = ${id} ORDER BY postID desc`;
  let row2 = await executeSQL(sql2);

  res.render("home", {"data": accountData.body, "songs": songData.body.items, "albums":albumData.body.items, "posts":row2});
});

app.get("/playlist", isAuthenticated,async function(req, res){
  var user = sessionStorage.getItem(req.sessionID);
  var spotify = new SpotifyWebApi();
  spotify.setAccessToken(user[0].access_token);
  spotify.setRefreshToken(user[0].refresh_token);
  var id = user[0].spotify_id;
  const playData = await spotify.getUserPlaylists(id);
  var playlist = playData.body.items

  res.render("playlist", {"list":playlist, "tok": user[0].access_token});
});

app.get("/album", isAuthenticated,async function(req, res){
  var user = sessionStorage.getItem(req.sessionID);
  var spotify = new SpotifyWebApi();
  spotify.setAccessToken(user[0].access_token);
  spotify.setRefreshToken(user[0].refresh_token);

  const albums = await spotify.getMySavedAlbums({limit : 5, offset: 0});

  res.render("album", {"albums" : albums.body.items})
});



app.get("/search", isAuthenticated,async function(req, res){
  var user = sessionStorage.getItem(req.sessionID);
  var spotify = new SpotifyWebApi();
  spotify.setAccessToken(user[0].access_token);
  spotify.setRefreshToken(user[0].refresh_token);
  spotify.getAcc
  let search = req.query.search;
  const searchData = await spotify.searchTracks(search);
  var songs = searchData.body.tracks.items;

  res.render("searchResults", {"songs": songs, "term":search});
});



app.get("/song", isAuthenticated,async function(req, res){
  
  var user = sessionStorage.getItem(req.sessionID);
  var spotify = new SpotifyWebApi();
  spotify.setAccessToken(user[0].access_token);
  spotify.setRefreshToken(user[0].refresh_token);

  // var num = Math.floor(Math.random() * 10);
  const songData = await spotify.getMySavedTracks({limit : 20, offset: 1});

  res.render("song", {"songs" : songData.body.items})
});

/*
|==========================|
|CONNECT TO SPOTIFY ACCOUNT|
|==========================| 
*/

app.get("/spotifyLogin", async function(req, res){
  var scopes = ['user-top-read', 'user-read-private', 'user-read-email', 'user-library-read', 'playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-public',
  'playlist-modify-private'];
  var showDialog = true;
  var authorizeURL = spotifyApi.createAuthorizeURL(scopes, stateKey, showDialog);
  res.send(authorizeURL);
});

app.get("/callback", async function (req, res) {
  var authorizationCode = req.query.code;
  
  spotifyApi.authorizationCodeGrant(authorizationCode)
  .then(async function(data) {
        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + data.body['access_token'] },
          json: true
        };

        request.get(options, async function(error, response, body) {

          let id = body.id;
          spotifyApi.setAccessToken(data.body['access_token']);
          spotifyApi.setRefreshToken(data.body['refresh_token']);
          
          let sql = `SELECT spotify_id from tbllogin where spotify_id = "${id}"`;
          let user = await executeSQL(sql);
          let size = user.length;

          if(size == 0){
            sql = `INSERT INTO tbllogin (username, spotify_id, session_id, access_token, refresh_token) VALUES ( ?, ?, ?, ?, ?)`;
            let params = [body.display_name, id, req.sessionID, data.body['access_token'], data.body['refresh_token']];
            let rows = await executeSQL(sql, params);
          }
          else{
            sql = `UPDATE tbllogin SET session_id = ?, access_token = ?, refresh_token = ? WHERE spotify_id = "${id}"`;
            let params = [req.sessionID, data.body['access_token'], data.body['refresh_token']];
            let rows = await executeSQL(sql, params);
          }

          sql = `SELECT * from tbllogin where spotify_id = "${id}"`;
          rows = await executeSQL(sql);
          sessionStorage.setItem(req.sessionID, rows);
         });


    res.redirect(`/#access_token=${data.body['access_token']}&refresh_token=${data.body['refresh_token']}`);

  }, function(err) {
    console.log('Something went wrong when retrieving the access token!', err.message);
  });

});

app.get('/endpoint', async function (req, res) {
  req.session.authenticated = true;
  var spotify = new SpotifyWebApi();

  spotify.setAccessToken(req.headers['authorization'].split(' ')[1]);
  res.redirect("home");
});

/*
|==========================|
|===========FORUM==========|
|==========================| 
*/

app.get("/forum", async function(req, res){
  let sql = `SELECT tblpost.*,DATE_FORMAT(tblpost.date, '%Y-%m-%d') dateISO, username from tblpost INNER JOIN tbllogin on id = posterID ORDER BY postID desc`;
  let rows = await executeSQL(sql);
  let user =  sessionStorage.getItem(req.sessionID);
  res.render("forum", {"posts": rows, "user": user[0]});
});

app.post("/forum", async function(req, res){
  let sql = `SELECT *,DATE_FORMAT(date, '%Y-%m-%d') dateISO, username from tblpost INNER JOIN tbllogin on id = posterID WHERE tag = "${req.body.tag}" ORDER BY postID desc`;
  let rows = await executeSQL(sql);
  let user =  sessionStorage.getItem(req.sessionID);
  res.render("forum", {"posts": rows, "user": user[0]});
});

app.get("/forum/post/new", async function(req, res){
  res.render("newPost");
});

app.post("/forum/post/new", async function(req, res){
  let user =  sessionStorage.getItem(req.sessionID);
  let date = new Date();
  date.setMonth(date.getMonth());
  let dateString = new Date(date)
  date = dateString.toISOString().slice(0,10)

  let description = req.body.description;
  let title = req.body.title;
  let tag = req.body.tag;
  let sql = "INSERT INTO tblpost (posterID, date, description, title, tag) VALUES (?, ?, ?, ?, ?)";
  

  let params = [user[0].id, date, description, title, tag];
  let rows = await executeSQL(sql, params);

  res.render("newPost", {"message":"Post added!"});
});


app.get("/forum/post", async function(req, res){
  let postID = req.query.postID;
  let sql1 = `SELECT tblreplies.*, DATE_FORMAT(tblreplies.date, '%Y-%m-%d') dateISO,    username
             FROM tblreplies INNER JOIN tbllogin on id = posterID
             WHERE postID = ${postID}`;
  let replies = await executeSQL(sql1);
  let sql2 = `SELECT tblpost.*, DATE_FORMAT(tblpost.date, '%Y-%m-%d') dateISO, username from tblpost INNER JOIN tbllogin on id = posterID where postID = ${postID}`;
  let post = await executeSQL(sql2);
  res.render("post", {"post":post, "replies": replies});
});

app.post("/forum/post", async function(req, res){
  
  let postID = req.body.postID;
  let description = req.body.description;
  let user = sessionStorage.getItem(req.sessionID);
  let date = new Date();
  date.setMonth(date.getMonth());
  let dateString = new Date(date)
  date = dateString.toISOString().slice(0,10)

  let sql = "INSERT INTO tblreplies (posterID, postID, date, description) VALUES (?, ?, ?, ?)"
  let params = [user[0].id, postID, date, description];
  let rows = await executeSQL(sql, params);
    
  res.redirect(`/forum/post?postID=${postID}`)

});


app.get("/forum/post/edit", async function(req, res){ 
  let postID = req.query.postID;
  let sql = `SELECT * from tblpost WHERE postID = ${postID}`;
  let rows = await executeSQL(sql);
  res.render("postInfo", {"rows": rows[0]});
});

app.get("/forum/post/delete", async function(req, res){
  let postID = req.query.postID;
  let sql = `SELECT * from tblpost WHERE postID = ${postID}`;
  let rows = await executeSQL(sql);
  res.render("postDelete", {"rows": rows[0]});
});

app.post("/forum/post/delete", async function(req, res){
  let postID = req.body.postID;

  let sql2 = `DELETE from tblreplies WHERE postID = ${postID}`;
  let sql = `DELETE from tblpost WHERE postID = ${postID}`;
  let rows = await executeSQL(sql2);
  rows = await executeSQL(sql);
    
  res.redirect(`/forum`);
});


app.post("/forum/post/edit", async function(req, res){
  let title = req.body.title;
  let description = req.body.description;
  let tag = req.body.tag;
  let postID = req.body.postID;

  let sql = `UPDATE tblpost SET title = ?, description = ?, tag = ? WHERE postID = ${postID}`;
  
  let params = [title, description, tag];
  let rows = await executeSQL(sql, params);
    
  res.redirect(`/forum`);
});

//---------------------------------------------------------------------

//-----------------------------SQL-------------------------------------
app.get("/dbTest", async function(req, res){

let sql = "SELECT CURDATE()";
let rows = await executeSQL(sql);
res.send(rows);
});//dbTest

//functions
async function executeSQL(sql, params){
return new Promise (function (resolve, reject) {
pool.query(sql, params, function (err, rows, fields) {
if (err) throw err;
   resolve(rows);
});
});
}//executeSQL
//values in red must be updated
function dbConnection(){

   const pool  = mysql.createPool({

      connectionLimit: 10,
      host: "wcwimj6zu5aaddlj.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
      user: "l9hpw8gcp9hcc5w0",
      password: "lzdk10vbcm5p8p03",
      database: "kclk06g46mxacuml"
   }); 

   return pool;

} //dbConnection

//start server
app.listen(3000, () => {
console.log("Expresss server running...")
} )

//---------------------------------------------------------------------
//middleware functions
function isAuthenticated(req, res, next){
    if (!req.session.authenticated) {
        res.redirect("/"); 
        //user is not authenticated
    } else {
      next();
    }
}

//Random Quote API
async function randomQuote() {
  const response = await fetch('https://api.quotable.io/random')
  const data = await response.json()
  return data;
}
