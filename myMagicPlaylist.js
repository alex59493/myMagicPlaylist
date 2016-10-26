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
const LIMIT_ART = 8;
const LIMIT_TRACKS = 4;
const PLAYLIST_ID = Date.now(); // Unique Id for the created playlist


// For a specific query string, return a list of best tracks
var query2Tracks = (q) => {
    return new Promise (function(resolve, reject) {
    	spotifyApi
			.searchTracks(q)
			.then(function(data) {
				resolve(data.body.tracks.items.slice(0, LIMIT_RESULTS_QUERY));
			}, function(err) {
				reject(err);
			});
    });
};

// For a specific track, return a list of artists related to the main artist of the track
var getRelatedArtists = (track) => {
	return new Promise (function(resolve, reject) {
		var artist = track.artists[0];
		spotifyApi
			.getArtistRelatedArtists(artist.id)
	  		.then(function(data) {
	    		resolve(data.body.artists.slice(0, LIMIT_ART));
	  		}, function(err) {
	    		reject(err);
	  		});
  	});
};

// For a specific artist, get its more popular tracks
var artist2TopTracks = (artist) => {
	return new Promise (function(resolve, reject) {
		spotifyApi.getArtistTopTracks(artist.id, 'GB')
		  	.then(function(data) {
		    	resolve(data.body.tracks.slice(0, LIMIT_TRACKS));
	    	}, function(err) {
		    	reject(err);
		  	});
  	});
};

// For a specific track, return its Youtube Url
var track2Url = (track) => {
	return new Promise (function(resolve, reject) {
		let query_youtube = track.artists[0].name + ' - ' + track.name; // Ex : "Artist - TrackName"

		youTube.search(query_youtube, 1, function(error, result) {
			if (error) {
				reject(error);
		  	}
		  	else {
		  		var vidName = formatVidName(result.items[0].snippet.title);
			    var vidId = result.items[0].id.videoId;
			    var url = "http://www.youtube.com/watch?v=" + vidId;

			    resolve({url: url, vidName: vidName});
		  	}
		});
	});
};

// For a specific Youtube url, download Youtube video
var url2Video = (resp) => {
	return new Promise (function(resolve, reject) {
		var options = {
			"quality": "highest",
			"filter": function(format) { return format.container === 'mp4'; }
		};

		var path = 'videos/' + PLAYLIST_ID + "/" + resp.vidName + '.mp4';

		ytdl(resp.url, options)
		  	.pipe(fs.createWriteStream(path))
		  	.on('finish', function() {
		  		resolve({vidName: resp.vidName, path: path});
		  	})
		  	.on('error', function() {
		  		reject("Error with ytdl");
		  	});
  	});
};

// For a specific video, convert to mp3
var video2Mp3 = (resp) => {
	return new Promise (function(resolve, reject) {
		var output = "musics/" + PLAYLIST_ID + "/" + resp.vidName + ".mp3";

		ffmpeg({ source: resp.path })
			.toFormat('mp3')
			.saveToFile(output)
			.on('error', function(e) {
				reject(e);
			})
			.on('end', function() {
		  		resolve(true);
			});
	});
};

// Remove undesirable characters ('/', ...)
var formatVidName = (vidName) => {
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
var researchConsole = () => {
	return new Promise (function(resolve, reject) {
		prompt.start();
		prompt.get('q', (err, result) => {
			if (err) throw err;
			query2Tracks(result.q)
				.then(function(tracks) {
					console.log("Found " + tracks.length + " tracks, select one : ");
					// Display result of search
					for (let i = 0; i < tracks.length; i++) {
						console.log(i + ") " + tracks[i].artists[0].name + " - " + tracks[i].name);
					}
					prompt.get('choice', (err, result) => {
						if (err) throw err;
						var track = tracks[parseInt(result.choice)];
						resolve(track);
					});
				}).catch(function(err) {
		            reject(err);
		        });
    	});
	});
};

// Test code
/*
researchConsole()
	.then(function(track) {
		console.log(track);
	}).catch(function(err) {
	    console.log(err);
	});
*/


var generatePlaylist = (track) => {
	return new Promise(function(resolve, reject) {
		var playlist = [];

		getRelatedArtists(track)
			.then(function(artists) {
				return Promise.all(artists.map(function (artist) {
					return artist2TopTracks(artist)
				  		.then(function(tracks) {
						    for (let i = 0; i < tracks.length; i++) {
								playlist.push(tracks[i].id);
							}
					  	}).catch(function(err) {
						    reject(err);
						});
				}));
			}).then(function() {
				resolve(playlist);
			}).catch(function(err) {
			    reject(err);
			});
	});
};

// Test code
/*
researchConsole()
	.then(function(track) {
		return generatePlaylist(track);
	}).then(function(playlist) {
		console.log(playlist);
	}).catch(function(err) {
	    console.log(err);
	});
*/


var downloadPlaylist = (playlist, callback) => {
	async.parallel([
	    function(callback1){
	    	fs.mkdir('videos/' + PLAYLIST_ID, function() {
	    		callback1(null, 'Done');
	    	});
	    },
	    function(callback2){
	    	fs.mkdir('musics/' + PLAYLIST_ID, function() {
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
		});

	});
};

// Test code
/*
researchConsole((err, track) => {
	if (err) throw err;

	console.log("Generate playlist...");
	generatePlaylist(track, (err, playlist) => {
		if (err) throw err;
		console.log("Download playlist...");
		downloadPlaylist(playlist, (err, result) => {
			if (err) throw err;
			console.log("Done");
		});
	});
});
*/