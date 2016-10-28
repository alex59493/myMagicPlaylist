"use strict";

// Use this once node support es6 imports
/*
import * as SpotifyWebApi from 'spotify-web-api-node';
import * as YouTube from 'youtube-node';
import * as ytdl from 'ytdl-core';
import * as ffmpeg from 'fluent-ffmpeg';
import * as async from 'async';
import * as prompt from 'prompt';
import * as fs from 'fs';

import { YOUTUBE_API_KEY } from './secrets';
*/

const SpotifyWebApi = require('spotify-web-api-node');
const YouTube = require('youtube-node');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const prompt = require('prompt');
const fs = require('fs');
const Promise = require('promise');

const secrets = require('./secrets');

const spotifyApi = new SpotifyWebApi();
const youTube = new YouTube();
youTube.setKey(secrets.YOUTUBE_API_KEY);

const LIMIT_RESULTS_QUERY = 10;
const LIMIT_ART = 2;
const LIMIT_TRACKS = 2;
const PLAYLIST_ID = Date.now(); // Unique Id for the created playlist


// For a specific query string, return a list of best tracks
const query2Tracks = function(q) {
    return new Promise ((resolve, reject) => {
    	spotifyApi
			.searchTracks(q)
			.then(data => {
				let tracks = data.body.tracks.items.slice(0, LIMIT_RESULTS_QUERY);
				resolve(tracks);
			}, err => {
				reject(err);
			});
    });
};

// For a specific track, return a list of artists related to the main artist of the track
const getRelatedArtists = function(track) {
	return new Promise ((resolve, reject) => {
		let artist = track.artists[0];
		spotifyApi
			.getArtistRelatedArtists(artist.id)
	  		.then(data => {
	  			let artists = data.body.artists.slice(0, LIMIT_ART);
	    		resolve(artists);
	  		}, err => {
	    		reject(err);
	  		});
  	});
};

// For a specific artist, get its more popular tracks
const artist2TopTracks = function(artist) {
	return new Promise ((resolve, reject) => {
		spotifyApi.getArtistTopTracks(artist.id, 'GB')
		  	.then((data) => {
		  		let tracks = data.body.tracks.slice(0, LIMIT_TRACKS);
		    	resolve(tracks);
	    	}, (err) => {
		    	reject(err);
		  	});
  	});
};


// For a specific track, return its Youtube Url
const track2Url = function(track) {
	return new Promise ((resolve, reject) => {
		let query_youtube = track.artists[0].name + ' - ' + track.name; // Ex : "Artist - TrackName"

		youTube.search(query_youtube, 1, (error, result) => {
			if (error) reject(error);
		  	else {
		  		let vidName = formatVidName(result.items[0].snippet.title);
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

		ytdl(resp.url, options)
		  	.pipe(fs.createWriteStream(path))
		  	.on('finish', () => { resolve({vidName: resp.vidName, path: path}); })
		  	.on('error', () => { reject("Error with ytdl"); });
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

// Remove undesirable characters ('/', ...)
const formatVidName = function(vidName) {
	for (let i = 0; i < vidName.length; i++) {
		if (vidName[i] === "/") {
			vidName = vidName.replaceAt(i, "_");
		}
	}
	return vidName;
};

String.prototype.replaceAt = function(index, character) {
    return this.substr(0, index) + character + this.substr(index+character.length);
};


//
//	ACTUAL PROGRAM	
//

// Get the desired track from the user by using a console prompt
const researchConsole = function() {
	return new Promise ((resolve, reject) => {
		prompt.start();
		prompt.get('q', (err, result) => {
			if (err) throw err;
			query2Tracks(result.q)
				.then(tracks => {
					console.log("Found " + tracks.length + " tracks, select one : ");
					// Display result of search
					for (let i = 0; i < tracks.length; i++) {
						console.log(i + ") " + tracks[i].artists[0].name + " - " + tracks[i].name);
					}
					prompt.get('choice', (err, result) => {
						if (err) throw err;
						let track = tracks[parseInt(result.choice)];
						resolve(track);
					});
				}).catch(err => { reject(err); });
    	});
	});
};


const generatePlaylist = function(track) {
	return new Promise((resolve, reject) => {
		let playlist = [];

		getRelatedArtists(track)
			.then(artists => {
				return Promise.all(artists.map(artist => {
					return artist2TopTracks(artist)
				  		.then(tracks => {
						    for (let i = 0; i < tracks.length; i++) {
								playlist.push(tracks[i]);
							}
					  	}).catch(err => { reject(err); });
				}));
			}).then(() => {
				resolve(playlist);
			}).catch(err => { reject(err); });
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

// Test code
researchConsole()
	.then(track => {
		console.log("Generating playlist...");
		return generatePlaylist(track);
	}).then(playlist => {
		console.log("Downloading playlist...");
		return downloadPlaylist(playlist);
	}).then(() => {
		console.log("Done");
	}).catch(err => { console.log(err); });
