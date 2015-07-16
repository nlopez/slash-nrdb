var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var cheerio = require('cheerio');

var token = process.env.TOKEN || '';
var port = process.env.PORT || 3000;
var messages = {
    INVALID_TOKEN: 'SEA Source, Scorch, Scorch. FLATLINED, bitch. (invalid token)',
    NO_QUERY: 'You have to tell me what to look for, mate.',
    MULTIPLE_RESULTS: 'Multiple cards matched your search:',
    NO_RESULTS: 'You access R&D and see nothing of interest. (no matches)'
};

var app = express();
app.use(bodyParser.text());

// Allow cross–origin requests
app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// POST request returns JSON
app.post('/', function (req, res) {
    if (!req.body) return res.sendStatus(400);

    var postData = {};
    req.body.split('\n').map(function (s) {
        var m = s.split('=');
        postData[m[0]] = m[1];
    });
    postData.text = clean(postData.text.replace(postData.trigger_word, ''));

    if (postData.token !== token) {
        return res.json({
            text: messages.INVALID_TOKEN
        });
    } else if (!postData.text || !postData.text.length) {
        return res.json({
            text: messages.NO_QUERY
        });
    }

    search(postData.text, function ($, panel) {
        var o = '';
        var flavor;
        o += '*' + clean(panel.find('.panel-heading').text()).replace('♦', '◆') + '*\n';
        o += clean(panel.find('.card-info').text()) + '\n';
        panel.find('.card-text p').each(function (i, p) {
            o += '> ' + clean($(p).text()) + '\n';
        });
        flavor = clean(panel.find('.card-flavor').text());
        if (flavor.length) o += flavor + '\n';
        o += clean(panel.find('.card-illustrator').text()) + '\n';
        o += panel.find('a.card-title').attr('href');
        res.json({
            text: o
        });
    }, function (matches) {
        var o = '';
        o += messages.MULTIPLE_RESULTS + '\n\n\n';
        matches.text().split('\n').map(function (s) {
            return s.trim().replace('\t', '').replace(/\s\s+/g, ' ');
        }).filter(function (s) {
            return s.length > 0;
        }).map(function (s) {
            o += '  • ' + s + '\n';
        });
        res.json({
            text: o
        });
    }, function () {
        res.json({
            text: messages.NO_RESULTS
        });
    }, function () {
        res.sendStatus(500);
    });
});

// GET request returns plain text
app.get('/', function (req, res) {
    var text = req.query.text;
    res.type('text/plain');

    if (req.query.token !== token) {
        return res.send(messages.INVALID_TOKEN);
    } else if (!text || !text.length) {
        return res.send(messages.NO_QUERY);
    }

    search(text, function ($, panel) {
        var flavor;
        res.write('*' + clean(panel.find('.panel-heading').text()).replace('♦', '◆') + '*\n');
        res.write(clean(panel.find('.card-info').text()) + '\n');
        panel.find('.card-text p').each(function (i, p) {
            res.write('> ' + clean($(p).text()) + '\n');
        });
        flavor = clean(panel.find('.card-flavor').text());
        if (flavor.length) res.write(flavor + '\n');
        res.write(clean(panel.find('.card-illustrator').text()) + '\n');
        res.write(panel.find('a.card-title').attr('href'));
        res.end();
    }, function (matches) {
        res.write(messages.MULTIPLE_RESULTS);
        res.write('\n\n');
        matches.text().split('\n').map(function (s) {
            return s.trim().replace('\t', '').replace(/\s\s+/g, ' ');
        }).filter(function (s) {
            return s.length > 0;
        }).map(function (s) {
            res.write('  • ' + s);
            res.write('\n');
        });
        res.end();
    }, function () {
        res.send(messages.NO_RESULTS);
    });
});

app.listen(port);
console.info('Listening on port %s', port);

/**
 * Clean a string by removing tab characters and trailing whitespace
 *
 * @param String s
 */
function clean (s) {
    return s.replace(/\s\s+/g, ' ').trim();
}

/**
 * Substitute icons and strong tags inside NRDB body text
 *
 * @param String body
 */
function substitute (body) {
    body = body.replace('<span class="icon icon-click"></span>', ':_click:');
    body = body.replace('<span class="icon icon-credit"></span>', ':_credit:');
    body = body.replace('<span class="icon icon-trash"></span>', ':_trash:');
    body = body.replace('<span class="icon icon-link"></span>', ':_link:');
    body = body.replace('<span class="icon icon-mu"></span>', ':_mu:');
    body = body.replace('<span class="icon icon-1mu"></span>', ':_1mu:');
    body = body.replace('<span class="icon icon-2mu"></span>', ':_2mu:');
    body = body.replace('<span class="icon icon-3mu"></span>', ':_3mu:');
    body = body.replace('<span class="icon icon-recurring-credit"></span>', ':_recurringcredit:');
    body = body.replace('<span class="icon icon-subroutine"></span>', ':_subroutine:');
    body = body.replace('<strong>', '*');
    body = body.replace('</strong>', '*');
    return body;
}

/**
 * Search NetrunnerDB for the specified string
 *
 * @param String text String to search with
 * @param Function oneResult Callback if one card is found
 * @param Function manyResults Callback if more than one card is found
 * @param Function noResults Callback if no cards are found
 * @param Function error Callback if there was an error
 */
function search (text, oneResult, manyResults, noResults, error) {
    oneResult = oneResult || _noop;
    manyResults = manyResults || _noop;
    noResults = noResults || _noop;
    error = error || _noop;
    request('http://netrunnerdb.com/find/?q=' + text, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            body = substitute(body);
            var $ = cheerio.load(body);
            var panel = $('.panel');
            var matches = $('[data-th="Title"]');

            if (panel && panel.length === 1) {
                oneResult($, panel);
            } else if (matches.length) {
                manyResults(matches);
            } else {
                noResults();
            }
        } else {
            error();
        }
    });
}

/**
 * Empty function to use in place of missing callbacks
 */
function _noop () {}
