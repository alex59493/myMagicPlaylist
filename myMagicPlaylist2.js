"use strict";

const SpotifyWebApi = require('spotify-web-api-node');
const YouTube = require('youtube-node');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const Promise = require('promise');

const secrets = require('./secrets');

const spotifyApi = new SpotifyWebApi({
  	clientId : secrets.spotifyClientId,
  	clientSecret : secrets.spotifyClientSecret
});

const youTube = new YouTube();
youTube.setKey(secrets.YOUTUBE_API_KEY);

const USER_ID = '212vlt3wlc535plu6erjsm42i'; // Myself
const PLAYLIST_ID = Date.now(); // Unique Id for the created playlist


//
//	HELPERS	
//


// Retrieve an access token
const retrieveAccessToken = function() {
	return new Promise ((resolve, reject) => {
		spotifyApi.clientCredentialsGrant()
		  	.then(data => {
		    	// Save the access token so that it's used in future calls
		    	spotifyApi.setAccessToken(data.body['access_token']);
		    	resolve("Successfully connected");
		  	}, err => { reject(err); });
  	});
};


// Get my last playlist
const getMyPlaylistId = function() {
	return new Promise ((resolve, reject) => {
		spotifyApi.getUserPlaylists(USER_ID)
		  	.then(data => {
		    	resolve(data.body.items[0].id);
		  	}, err => { reject(err); });
  	});
};


// Get tracks in a playlist
const playlist2Tracks = function(playlistId) {
	return new Promise ((resolve, reject) => {
		spotifyApi.getPlaylistTracks('spotifydiscover', playlistId)
		  	.then(data => {
		  		let tracks = data.body.items.map(track => {
		    		return track.track;
		    	});
		    	resolve(tracks);
		  	}, err => { reject(err); });
  	});
};


// For a specific track, return its Youtube Url
const track2Url = function(track) {
	return new Promise ((resolve, reject) => {
		let query_youtube = track.artists[0].name + ' - ' + track.name; // Ex : "Artist - TrackName"

		youTube.search(query_youtube, 1, (error, result) => {
			if (error) { reject(error); }
		  	else {
	  			let vidName = result.items[0].snippet.title;
		  		vidName = vidName.replace("/", "_");
			    let vidId = result.items[0].id.videoId;
			    let url = "http://www.youtube.com/watch?v=" + vidId;

			    resolve({url: url, vidName: vidName});
		  	}
		});
	});
};


// For a specific Youtube url, download Youtube video
const url2Video = function(resp) {
	return new Promise ((resolve, reject) => {
		let options = {
			"quality": "highest",
			"filter": (format) => { return format.container === 'mp4'; }
		};

		let path = 'videos/' + PLAYLIST_ID + "/" + resp.vidName + '.mp4';

		try {
			ytdl(resp.url, options)
			  	.pipe(fs.createWriteStream(path))
			  	.on('finish', () => { resolve({vidName: resp.vidName, path: path}); })
			  	.on('error', () => { reject("Error with ytdl"); });
		}
		catch(e) { reject(e); }
  	});
};


// For a specific video, convert to mp3
const video2Mp3 = function(resp) {
	return new Promise ((resolve, reject) => {
		let output = "musics/" + PLAYLIST_ID + "/" + resp.vidName + ".mp3";

		ffmpeg({ source: resp.path })
			.toFormat('mp3')
			.saveToFile(output)
			.on('error', (e) => { reject(e); })
			.on('end', () => { resolve(output); });
	});
};


const createVideoFolder = new Promise((resolve, reject) => {
	fs.mkdir('videos/' + PLAYLIST_ID, e => {
		if (e) reject(e);
		resolve('Video folder created');
	});
});


const createMusicFolder = new Promise((resolve, reject) => {
	fs.mkdir('musics/' + PLAYLIST_ID, e => {
		if (e) reject(e);
		resolve('Music folder created');
	});
});


const downloadPlaylist = function(playlist) {
	return new Promise((resolve, reject) => {
		Promise.all([createVideoFolder, createMusicFolder])
			.then(() => {
				return Promise.all(playlist.map(track => {
					return track2Url(track)
				  		.then(url => {
						    return url2Video(url);
					  	}).then(video => {
						    return video2Mp3(video);
					  	}).then(() => {
					  		return new Promise((resolve, reject) => {
					  			console.log("Downloaded : " + track.artists[0].name + " - " + track.name);
					  			resolve(track);
					  		});
					  	}).catch(err => { return reject(err); });
				}));
			}).then(playlist => {
				resolve(playlist);
			}).catch(err => { reject(err); });
	});
};


//
//	ACTUAL PROGRAM
//


console.log("Retrieving Access token...");
retrieveAccessToken()
	.then(() => {
		console.log("Getting playlist Id...");
		return getMyPlaylistId();
	}).then(playlistId => {
		console.log("Retrieving playlist...");
		return playlist2Tracks(playlistId);
	}).then(playlist => {
		console.log("Downloading playlist...");
		return downloadPlaylist(playlist);
	}).then(() => {
 		console.log("Done");
 	}).catch(err => { console.log(err); });
