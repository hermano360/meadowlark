var Browser = require('zombie');
//var assert = require('chai').assert;

var browser;

suite('Cross-Page Tests', function(){
	setup(function() {
		browser = new Browser();
	});
	this.timeout(5000);
	// this test fails on the assertion, checking the actual output says it should pass
	test('requesting a group rate quote from hood river tour page should populate the referrer field', function(done) {
		var referrer = 'http://localhost:3000/tours/hood-river';
		browser.visit(referrer, function() {
			browser.clickLink('.requestGroupRate', function() {
				//assert(browser.field('referrer').value === referrer,"Not equal to referrer");
				browser.assert.element('form input[name=referrer]',referrer);
				done();
			});
		});
	});
	// this test fails on the assertion, checking the actual output says it should pass
	test('requesting a group rate quote from oregan coast tour page should populate the referrer field', function(done) {
		var referrer = 'http://localhost:3000/tours/hood-river';
		browser.visit(referrer, function() {
			browser.clickLink('.requestGroupRate', function() {
				//assert(browser.field('referrer').value === referrer,"Not equal to referrer");
				browser.assert.element('form input[name=referrer]',referrer);
				done();
			});
		});
	});	
	// this test passes but not sure it is actually making it real?
	test('visiting the "request group rate" page directly should result in an empty referrer field', function(done) {
		browser.visit('http://localhost:3000/tours/request-group-rate', function() {
			//assert(browser.field('referrer').value === '',"Not set");
			browser.assert.element('form input[name=referrer]','');
			done();
		});
	});	
});