var SpotifyWebApi = require('spotify-web-api-node');
var YouTube = require('youtube-node');
var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
var async = require('async')
var prompt = require('prompt');
var fs = require('fs');

var secrets = require('./secrets');

/* Initialise APIs */
// Spotify
var spotifyApi = new SpotifyWebApi();
// Youtube
var youTube = new YouTube();
youTube.setKey(secrets.YOUTUBE_API_KEY);

const LIMIT_RESULTS_QUERY = 10
const LIMIT_ART = 8;
const LIMIT_TRACKS = 4;

// Unique Id for the created playlist
const playlistId = Date.now();

// For a specific query, search best results on Spotify
var query2Tracks = (q, callback) => {
	spotifyApi
		.searchTracks(q)
		.then(function(data) {
			callback(null, data.body.tracks.items.slice(0, LIMIT_RESULTS_QUERY));
		}, function(err) {
			callback(err, null);
		});
};

// For a specific track, get a list of artists related to the main artist of the track
var getRelatedArtists = (track, callback) => {
	var artist = track.artists[0];
	spotifyApi
		.getArtistRelatedArtists(artist.id)
  		.then(function(data) {
    		callback(null, data.body.artists.slice(0, LIMIT_ART));
  		}, function(err) {
    		callback(err, null);
  		});
};

// For a specific artist, get its more popular tracks
var artist2TopTracks = (artist, callback) => {
	spotifyApi.getArtistTopTracks(artist.id, 'GB')
	  	.then(function(data) {
	    	callback(null, data.body.tracks.slice(0, LIMIT_TRACKS));
    	}, function(err) {
	    	callback(err, null);
	  	});
};

// For a specific track, download its more matching video on youtube
var track2Url = (track, callback) => {
	// Create Youtube Query :
	// Ex : "Artist - TrackName"
	var query_youtube = track.artists[0].name + ' - ' + track.name;

	youTube.search(query_youtube, 1, function(error, result) {
		if (error) {
			callback(error, null);
	  	}
	  	else {
	  		var vidName = formatVidName(result['items'][0]["snippet"]["title"])
		    var vidId = result['items'][0]['id']['videoId'];
		    var url = "http://www.youtube.com/watch?v=" + vidId;

		    callback(null, {url: url, vidName: vidName});
	  	}
	});
};

// For a specific Youtube url, download Youtube video
var url2Video = (resp, callback) => {
	var options = {
		"quality": "highest",
		"filter": function(format) { return format.container === 'mp4'; }
	}

	var path = 'videos/' + playlistId + "/" + resp.vidName + '.mp4';

	ytdl(resp.url, options)
	  	.pipe(fs.createWriteStream(path))
	  	.on('finish', function() {
	  		callback(null, {vidName: resp.vidName, path: path});
	  	})
	  	.on('error', console.error);
}

// For a specific video, convert to mp3
var video2Mp3 = (resp, callback) => {
	var output = "musics/" + playlistId + "/" + resp.vidName + ".mp3";

	var command = ffmpeg({ source: resp.path })
		.toFormat('mp3')
		.saveToFile(output)
		.on('error', e => callback(e, null))
		.on('end', function() {
	  		callback(null, true);
		});
};

// Remove undesirable characters ('/', ...)
var formatVidName = (vidName) => {
	var vidNameLength = vidName.length;
	for (i = 0; i < vidNameLength; i++) {
		if (vidName[i] === "/") {
			vidName = vidName.replaceAt(i, "_");
		}
	}
	return vidName;
};

String.prototype.replaceAt=function(index, character) {
    return this.substr(0, index) + character + this.substr(index+character.length);
}


//
//	ACTUAL PROGRAM	
//

// Get the desired track from the user by using a console prompt
var researchConsole = (callback) => {
	prompt.start();
	prompt.get('q', (err, result) => {
		if (err) throw err;
		query2Tracks(result.q, (err, tracks) => {
			if (err) throw err;
			console.log("Found " + tracks.length + " tracks, select one : ");

			// Display result of search
			var tracksLength = tracks.length
			for (i = 0; i < tracksLength; i++) {
				console.log(i + ") " + tracks[i].artists[0].name + " - " + tracks[i].name);
			}
			prompt.get('choice', (err, result) => {
				if (err) throw err;
				var track = tracks[parseInt(result.choice)];
				callback(null, track);
			});
		});
	});
};

/*
// Test code
researchConsole((err, track) => {
	if (err) throw err;
	else console.log(track)
});
*/

var generatePlaylist = (track, callback) => {
	var playlist = [];

	async.waterfall([
		async.apply(getRelatedArtists, track),
		(artists, callback1) => {
			async.each(artists, (artist, callback2) => {
				artist2TopTracks(artist, (err, tracks) => {

					var t;
					for (t = 0; t < tracks.length; t++) {
						playlist.push(tracks[t]);
					};

					callback2();
				});
			},
			function(err){
			    if (err) throw err;
			    callback1();
			})
	    },
	], function (err, result) {
	    if (err) throw err;
	    else callback(null, playlist);
	});
};

// Test code
/*
researchConsole((err, track) => {
	if (err) throw err;

	console.log("Generate playlist...")
	generatePlaylist(track, (err, playlist) => {
		if (err) throw err;
		console.log(playlist);

	});
});
*/

var downloadPlaylist = (playlist, callback) => {
	async.parallel([
	    function(callback1){
	    	fs.mkdir('videos/' + playlistId, function() {
	    		callback1(null, 'Done');
	    	});
	    },
	    function(callback2){
	    	fs.mkdir('musics/' + playlistId, function() {
	    		callback2(null, 'Done');
	    	});
	    },
	],
	function(err, results){
	    if (err) throw err;

	    async.each(playlist, (track, callback) => {
			async.waterfall([
				async.apply(track2Url, track),
			    url2Video,
			    video2Mp3,
			], function (err, result) {
			    if (err) console.error(err);
			    else console.log("Downloaded : " + track.artists[0].name + " - " + track.name);
			    callback();
			});
		},
		function(err){
		    if (err) throw err;
		    callback();
		})

	});
};

// Test code
researchConsole((err, track) => {
	if (err) throw err;

	console.log("Generate playlist...")
	generatePlaylist(track, (err, playlist) => {
		if (err) throw err;
		console.log("Download playlist...")
		downloadPlaylist(playlist, (err, result) => {
			if (err) throw err;
			console.log("Done");
		});
	});
});
