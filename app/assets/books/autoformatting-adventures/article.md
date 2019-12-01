# Autoformatting Adventures

*An adventure in developer tooling and the world of open source*

### Adding autoformatting

I recently introduced my team to [Prettier][0]
an automatic code formatting tool targeted towards frontend languages.
Writing code with a standardized autoformatter is a freeing experience;
you can take your mind off of monotonous things like precise indentation, trailing commas, and whitespace,
and instead focus solely on the bigger challenges of software engineering.

What's this look like in practice? You can write absolutely horrible code like:

```js
const myFunction = (param1, param2,

param3, ) => { 
return "This is so bad";
      }
```

And Prettier will come and clean it up for you:

```js
const myFunction = (param1, param2, param3) => {
  return 'This is so bad';
};
```

#### Challenges may arise 

If you have a new codebase, it's easy to introduce a mandatory autoformatting tool.
However, if you have a large existing codebase, it's a little trickier because you have
thousands of files of code which aren't formatted correctly by the new standards.

The simplest way to go about things is to run the autoformatter once on the whole codebase initially
and introduce the autoformatter as a mandatory linting check from then on.
Unfortunately, this will destroy your current git blame.
There will also a little bit of pain as any open PRs will likely now have conflicts with your main branch.

[An interesting alternative solution][change-history]
involves rewriting your entire git history as if the autoformatter had been there the whole time.
It's a neat trick that'll preserve your git blame,
but it's quite invasive and not something most teams will be keen on attempting.

Another solution is to apply the autoformatter lazily -
that is, don't enforce autoformatting of files until they're part of an active pull request.
This sounds good because it lets things change incrementally, but it'll 
leave your codebase in an inconsistent style for a long period of time.
Even worse, it becomes common for semantic changes in a pull request
to be obscured by autoformatting changes the first time the autoformatter is triggered for a file.

For our codebase, I decided it would be best to simply apply Prettier to our entire codebase at once.
A few merge conflicts aren't that difficult to deal with, 
and good git tooling can show older blames and minimize the impact of the blame changes.


### Troubling times

Decision made, I ran Prettier on every frontend file in our codebase
with a surprisingly quick  `prettier --list-different --write "**/*.{js,jsx,ts,tsx}"` command.
I committed all the changes to a new branch, opened up a PR, and let our CI run through all its tests.
So easy! **Except one test was failing.**

Having a test start failing because of an autoformatting tool is concerning.
An autoformatter should never change how code executes or what code does, it should only change the code's appearance.

It takes time for us as humans to build up trust towards automation, even when it's much more reliable that we are.
I wanted my teammates to be able to trust (and love) Prettier, and a failing test would not help that.
I knew I needed to dive in and figure out where Prettier let me down. 

#### The failing test

I first looked to see which test was failing; it was a test about margins:

```ts
it('adds a margin to everything not in the last row', () => {
  const marginBottom = (index: number) =>
    parseInt(
      window.getComputedStyle(
        component
          .find(DetailBlock)
          .at(index)
          .getDOMNode(),
      ).marginBottom || '0',
      10,
    );

  [component] = mount(
    <DetailBlockGroup>
      <DetailBlock title="" />
      <DetailBlock title="" />
      <DetailBlock title="" />
      <DetailBlock title="" />
    </DetailBlockGroup>,
  );
  expect(marginBottom(0)).toBeGreaterThan(0);
  expect(marginBottom(1)).toBeGreaterThan(0);
  expect(marginBottom(2)).toBe(0);
  expect(marginBottom(3)).toBe(0);
});
```

This is an interesting test: most of our tests are focused on JavaScript/React/DOM-structure related issues,
but this test is actually looking at what the CSS `margin-bottom` value is for a bunch of DOM elements.

I jumped over to the file for the `DetailBlock` / `DetailBlockGroup` components
and found that Prettier had only made one change - it had added whitespace around the `+` operator in a couple CSS selectors:

![code diff of DetailBlockGroup][code-diff]

Huh. First-off, what is this code even doing? Turns out it's
[a selector to match all the items in the last row of a grid][grid-selector].

Our test above checks that this selector correctly sets the bottom margin to zero on the expected elements.

#### Reproducing the problem

Why would adding spaces around the `+` operator in an `:nth-last-child` selector change what elements it's targeting?
I threw together a garish JSFiddle to build a small reproduction of the problem.
However, both selectors, with and without spaces, worked as expected:

<script async src="//jsfiddle.net/jkillian/53gf0x2u/embed/css/dark/"></script>
<script async src="//jsfiddle.net/jkillian/53gf0x2u/embed/result/dark/"></script>

I also spun up our app in Chrome and opened it to a page using `DetailBlock` in a grid.
Both the version of the selector with and without spaces worked correctly again,
matching the bottom row of `DetailBlock`s and setting their bottom margin to zero.

If the code was working perfectly in my reproductions, why did the test start failing?


### Diving deeper

We use [Jest](https://jestjs.io/) and [Enzyme](http://airbnb.io/enzyme/) (along with other libraries) for frontend testing on my team.
By default, Jest uses [jsdom](https://github.com/jsdom/jsdom) to simulate a browser JavaScript environment when it runs tests.
This means that common APIs you might use in a web app, such as `document.querySelector` are implemented by jsdom.

#### jsdom
There are advantages to using jsdom for testing: it's quite fast and it's a pure JS node module (so it's easy to run as part of CI, on any platform Node.js runs on).
However, it's possible that differences between jsdom and a real browser environment could lead to subtle differences in tests vs. production.

I had never looked into jsdom much before, but it seemed possible that it was mishandling our CSS selector in question.
jsdom's API is quite easy to get started with, so [I wrote up a small NodeJS script][runkit] to test out the two versions of our `nth-last-child` selector.
And finally! jsdom was incorrectly handling our CSS selector with spaces and thus I had a simple reproduction of the bug.

#### NWSAPI

I dug into the jsdom repository to try and figure out how it handled CSS selectors.
Eventually, I came to a [pull request which updated jsdom to use a new CSS selector library][jsdom-pr], called [NWSAPI][nwsapi].
NWSAPI describes itself as a "Fast CSS Selectors API Engine". It seemed that I had finally come to the root of the problem!

I filed an [issue](nwsapi-issue) with NWSAPI and got to work trying to also file a pull request to fix the issue.
The technical challenges here didn't seem especially novel, and it seemed a simple tweak to some of the regular expressions in the library would fix the issue.
With the help of [regex101](https://regex101.com/), I quickly had [a pull request ready to go][nwsapi-pr].

The NWSAPI maintainer, [@dperini](https://github.com/dperini), was very responsive to my issue and pull request.
Unfortunately, fixing whitespace handling in NWSAPI turned out to be a more complex problem than I expected,
and my solution was clearly inadequate.
I had succumbed to the ever present software engineering temptation of making a hacky fix instead of fixing a problem correctly.
Luckily though, @dperini took the time to put together a thorough fix and the bug is now gone on the latest version of NWSAPI.

#### Web-platform-tests

In the process of working on NWSAPI, @dperini suggested I submit a PR to the [web-platform-tests project][wpt].
Having never heard of this project before, I did a little researching and reading around and was fascinated by what I found:
the WPT project is essentially a comprehensive test suite for the entire [web platform](https://platform.html5.org/)
(excluding the JavaScript language itself and WebGL).

[Firefox][firefox-wpt] and [Chrome][chrome-wpt] actively use and contribute to this test suite,
and I wouldn't be surprised if Edge and Safari do also, though I couldn't find information about this.
Philippe le Hegaret has a [nice post explaining how the web-platform-tests project has taken off][wpt-growth].

The WPT project usefulness isn't limited to major browsers - it also is a great way for projects like jsdom and NWSAPI to test themselves.
Following @dperini's idea, I submitted [a PR adding new tests which covered the whitespace bug I found][wpt-pr].
It was a surprisingly easy project to contribute to,
and it's fun to think about how that code will be used to validate browser behavior for a long time to come.

### The end of the story

With the underlying bug fixed and tests added to the WPT platform,
I merged my PR reformatting our team's entire codebase and adding Prettier as part of our linting system.

My coworkers were very willing to adjust to the new workflow of using an autoformatter,
and there's been not a single issue or complaint in the month since we started using Prettier.

Just this past week in fact, one of my teamates added [yapf][yapf], a Python autoformatter to our repo's tooling as well.
(I was quite delighted!)

It's quite amazing the amount of open source work we rely on every day in ou day to day work as software engineers,
and I'm grateful to all the people who have put in effort to developing and maintaining Prettier, jsdom, NWSAPI, the WPT project,
and the multitude of other open source libraries I was implicitly relying on as I poked around these tools.

May we all continue to appreciate this work and contribute back when possible!

<br/>

*Have a comment or find an error in the above article?
Please submit an issue or PR [to the Github repo for this website][article-source].*

[0]: https://prettier.io/
[change-history]: https://medium.com/millennial-falcon-technology/reformatting-your-code-base-using-prettier-or-eslint-without-destroying-git-history-35052f3d853e 
[grid-selector]: https://keithclark.co.uk/articles/targeting-first-and-last-rows-in-css-grid-layouts/#last-row-of-a-balanced-or-unbalanced-grid
[code-diff]: /articles/prettier/detail-block-diff.png
[runkit]: https://runkit.com/jkillian/jsdom-bug#
[jsdom-pr]: https://github.com/jsdom/jsdom/pull/2229
[nwsapi]: https://github.com/dperini/nwsapi
[nwsapi-issue]: https://github.com/dperini/nwsapi/issues/20
[nwsapi-pr]: https://github.com/dperini/nwsapi/pull/21
[nwsapi-fix]: https://github.com/dperini/nwsapi/commit/9dfcc2ab4c383d860c67cfb19effe584f8a8c553
[gofmt]: https://golang.org/cmd/gofmt/
[rustfmt]: https://github.com/rust-lang/rfcs/pull/2436
[lsp]: https://microsoft.github.io/language-server-protocol/
[lsp-usage]: https://langserver.org/
[wpt]: https://github.com/web-platform-tests/wpt
[wpt-pr]: https://github.com/web-platform-tests/wpt/pull/12561
[web-platform]: https://platform.html5.org/.
[chrome-wpt]: https://chromium.googlesource.com/chromium/src/+/master/docs/testing/web_platform_tests.md
[firefox-wpt]: https://github.com/web-platform-tests/wpt/pulls?q=is%3Apr+author%3Amoz-wptsync-bot+is%3Aclosed
[wpt-growth]: https://www.w3.org/blog/2017/05/the-web-platform-tests-project/
[yapf]: https://github.com/google/yapf
[article-source]: https://github.com/JKillian/jasonkillian.com/tree/master/app/assets/articles/autoformatting-adventures/article.md