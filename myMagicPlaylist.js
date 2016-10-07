var SpotifyWebApi = require('spotify-web-api-node');
var YouTube = require('youtube-node');
var ytdl = require('ytdl-core');
var fs = require('fs');
var ffmpeg = require('fluent-ffmpeg');
var prompt = require('prompt');

/* Initialise APIs */
// Spotify
var spotifyApi = new SpotifyWebApi();
// Youtube
var youTube = new YouTube();
youTube.setKey('AIzaSyCQ1FTnfcEiD6s5GTUfaT8SsXaUlA6vCsQ');

const LIMIT_ART = 10;
const LIMIT_TRACKS = 4;

// Unique Id for the created playlist
var playlistId = Date.now();

// For a specific query, search best result on Spotify and get a Json containing all the informations about the track
var query2Tracks = (q, callback) => {
	spotifyApi
		.searchTracks(q)
		.then(function(data) {
			callback(null, data.body.tracks.items.slice(0, 10));
		}, function(err) {
			console.log('Something went wrong!', err);
			callback(err, null);
		});
};

// For a specific track, get a list of artists related to the main artist of the track
var getRelatedArtists = (track, callback) => {
	var artist = track.artists[0];
	var limit_art = LIMIT_ART; // Limit returned related artists to `limit_art`
	spotifyApi
		.getArtistRelatedArtists(artist.id)
  		.then(function(data) {
  			console.log("Found " + limit_art + " artists related to " + artist.name);
    		callback(null, data.body.artists.slice(0, limit_art));
  		}, function(err) {
    		console.log('Something went wrong!', err);
    		callback(err, null);
  		});
};

// For a specific artist, get its 5 more popular tracks
var artist2TopTracks = (artist, callback) => {
	var limit_tracks = LIMIT_TRACKS; // Limit returned tracks to `limit_tracks`
	spotifyApi.getArtistTopTracks(artist.id, 'GB')
	  	.then(function(data) {
	  		//console.log("Found " + limit_tracks + " bests tracks for artist " + artist.name);
	    	callback(null, data.body.tracks.slice(0, limit_tracks));
    	}, function(err) {
	    	console.log('Something went wrong!', err);
	    	callback(err, null);
	  	});
};

// For a specific track, download its more matching video on youtube
var track2Video = (track, callback) => {
	var query_youtube = track.artists[0].name + ' - ' + track.name;
	//console.log("Searching best Youtube video for query : " + query_youtube)
	console.log(query_youtube);
	youTube.search(query_youtube, 1, function(error, result) {
		if (error) {
			callback(error, null);
		    console.log(error);
	  	}
	  	else {
	  		var vidName = result['items'][0]["snippet"]["title"]
		    var vidId = result['items'][0]['id']['videoId'];
		    var url = "http://www.youtube.com/watch?v=" + vidId;

		    console.log('Downloading video from Youtube...');

		    var options = {
				"quality": "highest",
				"filter": function(format) { return format.container === 'mp4'; }
			}

			var path = 'videos/' + playlistId + "/" + vidName + '.mp4';

			ytdl(url, options)
			  	.pipe(fs.createWriteStream(path))
			  	.on('finish', function() {
			  		callback(null, {vidName: vidName, path: path});
			  	})
			  	.on('error', console.error);
	  	}
	});
};

// For a specific video, convert to mp3
var video2Mp3 = (resp, callback) => {
	console.log('Converting video to mp3...')

	var output = "musics/" + playlistId + "/" + resp.vidName + ".mp3";

	try {
		var command = ffmpeg({ source: resp.path })
			.toFormat('mp3')
			.saveToFile(output)
			.on('error', e => callback(e, null))
			.on('end', function() {
		  		callback(null, true);
			});
	} catch(e) {
	  	callback(e, null);
	}
};

// Remove undesirable characters ('/', ...)
var formatVidName = (vidName) => {
	for (i=0; i<vidName.length; i++) {

	};
};

prompt.start();
prompt.get('q', (err, result) => {
	query2Tracks(result.q, (err, tracks) => {
		if (err) throw err;
		console.log("Found " + tracks.length + " tracks, select one : ")
		for (i=0; i<tracks.length; i++) {
			// Display matching tracks
			console.log(i + ") " + tracks[i].artists[0].name + " - " + tracks[i].name);
		}
		prompt.get('choice', (err, result) => {
			var track = tracks[parseInt(result.choice)];
			getRelatedArtists(track, (err, artists) => {
				if (err) throw err;
				artists.forEach(artist => {
					artist2TopTracks(artist, (err, tracks) => {
						if (err) throw err;
						tracks.forEach(track => {
							fs.mkdir('videos/' + playlistId, (err, result) => {
								track2Video(track, (err, v) => {
									if (err) console.err(err);
									fs.mkdir('musics/' + playlistId, (err, result) => {
										video2Mp3(v, (err, resp) => {
											if (err) console.error(err);
											console.log("Successfully downloaded");
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
