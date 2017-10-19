var bands;

var client_id = 'ea6d4c6a6f367767516c9221a30c2ced'; // soundcloud client_id
var analyzer, audio, gain; // for configure_webaudio
var $gd;

jQuery(document).ready(function() {

    // credits: https://stackoverflow.com/questions/22562113/read-html-comments-with-js-or-jquery#22562475
    $.fn.getComments = function () {
        return this.contents().map(function () {
            if (this.nodeType === 8) return this.nodeValue;
        }).get();
    };

    
    var toggle_html='<span class="toggle"></span>';

    // attach the plugin to an element
    $('#wrapper').gitdown( {    'title': 'BeatDown',
                                'content': 'README.md',
                                'callback': main,
                                'var_callback': gd_vars
    } );
    $gd = $('#wrapper').data('gitdown');

    function main() {

        bands = $gd.get_setting('bands');
        if ( bands === undefined ) {
            bands = 64;
        }
        if ( bands < 4 ) bands = 4;

        configure_webaudio(bands);

        // set initial volume based on slider
        var v = $('.info .slider.volume input').val();
        gain.gain.value = v;

        // create eq container
        var $eq = create_eq(bands);

        render_variables( '.inner .section *' );
        register_events();
        initialize_url();
        loop();
    }

    function configure_webaudio(bands) {
        // webaudio configuration
        var context = new AudioContext();
        analyser = context.createAnalyser();
        analyser.maxDecibels = -25;
        analyser.minDecibels = -90;
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;

        var filter = context.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 50;
        filter.Q.value = 1;

        gain = context.createGain();
        
        audio = new Audio();
        audio.crossOrigin = 'anonymous';

        var source = context.createMediaElementSource(audio);
        source.connect(gain);
        gain.connect(filter);
        filter.connect(analyser);
        gain.connect(context.destination);
    }

    function loop(){
        window.requestAnimationFrame(loop);
        var freq = new Uint8Array(bands);
        analyser.getByteFrequencyData(freq);
        
        freq.forEach( (f, i) => update_band(f, i) );
    }

    function convertRange( value, r1, r2 ) { 
        return ( value - r1[ 0 ] ) * ( r2[ 1 ] - r2[ 0 ] ) / ( r1[ 1 ] - r1[ 0 ] ) + r2[ 0 ];
    }

    function update_band( freq, i ){
        var $band = $('.eq .band-' + i);
        $band.attr('data-range', freq);
        
        // add frequency to data in case user wants to utilize it
        $band.attr('data-f', freq);

        // freq maxes at 256, scale freq to fit eq height
        var h = $('.eq').height();
        var f = convertRange( freq, [0, 256], [0, h] );

        // accentuate peaks by scaling based on nearness to height
        var scale = convertRange( f, [0, h], [0, 1] );
        f = f * scale;
        
        // set band height
        $band.height(f);

        // set band width
        var width = $('.eq').width();
        var spacing = parseInt( $band.css('margin-right') );
        var w = ( width / bands ) - spacing;
        $band.width(w);
        
        // set band's left position
        $band.css( 'left', i * ( width / bands ) );
    }

    function create_eq(bands) {
        var spacing = 10; // set default just for initial rendering
        $('.inner').append('<div class="eq"></div>');
        var $eq = $('.eq');
        var width = $eq.width();
        var height = $eq.height();

        var band_width = ( width / bands ) - spacing;
        var band_height = 0;

        var html = '<div class="eq-inner">';
        html += band_html(bands);
        html += '</div>';
        $eq.append(html);
        return $eq;
    }

    function band_html(bands) {
        var x = 0;
        var html = '';
        for ( var i = 0; i < bands; i++ ) {
            html += `<div class="band band-${i}"></div>`;
        }
        return html;
    }

    // configure soundcloud url
    function initialize_url() {

        var tracks = $gd.get_param('tracks');
        if ( !tracks ) {
            // play random track from list
            var t = $('.tracks-selector a.id').length;
            var r = Math.floor(Math.random() * (t - 0)) + 0;
            var l = $('.tracks-selector a.id').eq(r).attr('data-id');
            tracks = l;
        }

        // base soundcloud url
        var url = '//api.soundcloud.com/tracks/?';

        // add client id
        url += `client_id=${client_id}`;

        // check if user provided a track number
        var isnum = /^\d+$/.test(tracks);
        if ( isnum ) {    
            url += `&ids=${tracks}&`;
            play(url);
        } else if ( tracks.indexOf('soundcloud.com') > -1 ) {
            // soundcloud url specified so resolve it first
            sc_resolve( tracks, url );
        } else {
            // handle request as a query
            url += `&q=${tracks}`;
            play(url);
        }
    }

    function sc_resolve( t, url ) {
        var resolve_url = `//api.soundcloud.com/resolve.json?url=${t}&client_id=${client_id}`;
        $.get(resolve_url,
            function (result) {
                url += `&ids=${result.id}&`;
                play(url);
            }
        );
    }

    function get(url) {
        return new Promise( function (resolve, reject) {
            var http = new XMLHttpRequest();
            http.open('GET', url);
            http.onload = function () {
                if ( http.status === 200 ) {
                    resolve(http.response);
                } else {
                    reject( Error(http.statusText) );
                }
            };
            http.onerror = function () {
                reject( Error("Error with request.") );
            };
            http.send();
        });
    }

    function play(url){
        get(url).then(function (response) {
            var result = JSON.parse(response);
            var music = result[0];
            update_details(music);
            audio.src = music.stream_url + '?client_id=' + client_id;
            audio.play();
        }, function (error) {
            console.error( "Request failed.", error );
        });
    }

    function update_details(trackinfo){

        // first update .track-url in .info panel
        var $tracks_url = $('.info .tracks-url');
        if ( $tracks_url.length > 0 ) {
            $tracks_url.text( trackinfo["title"] + ' ▾' );
        }

        // now lets update all occurrences of $gd_track variables in content
        var $items = $('[id^="gd-track-"]');
        if ( $items.length < 1 ) return;
        
        var h = '';
        $items.each(function(i, val){
            var i = $(this).attr('id').split('gd-track-')[1];
            if ( i === 'title' ) {
                h = `<a href="${trackinfo["permalink_url"]}">${trackinfo["title"]}</a>`;
            } else if ( i === 'artwork_url' ) {
                h = `<img src="${trackinfo["artwork_url"]}"></img>`;
            } else if ( i === 'user' || i === 'username' || i === 'author' ) {
                h = ` - <a href="${trackinfo["user"].url}">${trackinfo["user"].username}</a>`;
            } else {
                h = trackinfo[i];
            }
            $(this).html(h);
        });
    }

    function register_events() {

        // volume change
        $('.info .slider.volume input').on('input change', function(e) {
            var v = $(this).val();
            gain.gain.value = v;
        });

        // band change
        $('.info .field.choices.bands .choice').click(function(){
            var value = $(this).attr('data-value');
            bands = value;
            // remove bands then create new ones
            $('.band').remove();
            var $eq_inner = $('.eq .eq-inner');
            $eq_inner.append( band_html(bands) );
        });

        // LEFT and RIGHT arrows
        $(document).keyup(function(e) {
            if( e.which == 37 || e.which == 100 ) {
                var $prev = $('.toc a.current').prev()[0];
                if (typeof $prev === "undefined") {
                    $('.toc a:last-child')[0].click();
                } else $prev.click();
            } else if (e.keyCode === 39 || e.which == 102 ) {
                var $next = $('.toc a.current').next()[0];
                if (typeof $next === "undefined") {
                    $('.toc a:first-child')[0].click();
                } else $next.click();
            }
        })

        // play next song when track finishes
        audio.addEventListener("ended", function(){
            audio.currentTime = 0;
            initialize_url();
       });

        // drag-and-drop file handler for local files
        var $c = $('.inner');
        $c.on( 'dragenter', function (e) {
            e.stopPropagation();
            e.preventDefault();
            $(this).css( 'filter', 'invert(100%)' );
        });
        $c.on( 'dragover', function (e) {
            e.stopPropagation();
            e.preventDefault();
        });
        $c.on( 'dragleave', function (e) {
            $(this).css( 'filter', 'none' );
        });
        $c.on( 'drop', function (e) {

            $(this).css( 'filter', 'none' );
            e.preventDefault();
            var files = e.originalEvent.dataTransfer.files;

            //We need to send dropped files to Server
            handle_file_upload(files);
        });
    }

    function handle_file_upload(f) {
        // for now, we'll just play the first dropped file
        let url = URL.createObjectURL( f[0] );
        audio.src = url;
        audio.play();
    }

    // returns true if n begins with str
    function begins( t, str ) {
        // only return true if str found at start of t
        if ( t.indexOf(str) === 0 ) {
            return true;
        }
        return false;
    };

    function gd_vars(x) {
        return x;
    }

    function variable_html( v, $t ) {
        // h is the html
        var h = '';
        var title = 'plugin.settings.title';
        if ( v != '' ) {
            if ( begins( v, '$gd_track_' ) ) {
                var x = v.split('$gd_track_')[1];
                var h = `<span id="gd-track-${x}">`;
                h += '</span';
                $t.append(h);
            }
        }
    };

    function render_variables( container ) {
        var $sections = $( container );
        if ( $sections.length > 0 ) {
            // find attributes and position section
            $sections.each(function() {
                var comments = $(this).getComments();
                if ( comments.length > 0 ) {
                    for ( var i = 0; i < comments.length; i++ ) {
                        var v = extract_variable( comments[i] );
                        if ( v != '' ) {
                            variable_html( v, $(this) );
                        }
                    }
                }
            });
        }
    };

    var extract_variable = function( v ) {
        // ensure there's an open paren
        if ( v.indexOf('{') != -1 ) {
            var v1 = v.split('{')[1];
            // ensure there's a closing paren
            if ( v1.indexOf('}') != -1 ) {
                var v2 = v1.split('}')[0];
                // ensure the variable begins with $
                if ( v2.indexOf('$') != -1 ) {
                    return v2;
                }
            }
        }
        return '';
    };

});