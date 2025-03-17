require('dotenv').config();

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');

const app = express();
const PORT = 3001;

const SERVER_ID = uuidv4();

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Configure OAuth2 strategy
passport.use(new OAuth2Strategy({
    name: 'Asgardeo',
    issuer: 'https://api.asgardeo.io/t/lasanthasamarakoon/oauth2/token',
    authorizationURL: 'https://api.asgardeo.io/t/lasanthasamarakoon/oauth2/authorize',
    tokenURL: 'https://api.asgardeo.io/t/lasanthasamarakoon/oauth2/token',
    userInfoURL: 'https://api.asgardeo.io/t/lasanthasamarakoon/oauth2/userinfo',
    clientID: 'lfOwYiCTLGrLijCUm5tc5ZUD5Csa',
    callbackURL: process.env.OAUTH_CALLBACK_URL,
    pkce: true, // Enable PKCE
    state: true,
    signUpURL: '',
    logoutURL: 'https://api.asgardeo.io/t/lasanthasamarakoon/oidc/logout',
    logoutRedirectURI: process.env.OAUTH_LOGOUT_URL,
    certificate: '',
    jwksURL: 'https://api.asgardeo.io/t/lasanthasamarakoon/oauth2/jwks',
    scope: ['openid', 'profile', 'email'],
  }, (accessToken, refreshToken, params, profile, done) => {
    // Store user info (Here, just storing accessToken for simplicity)

    console.log('profile ----------------------');
    console.log(profile);

    return done(null, { accessToken });
}));

// Serialize & deserialize user
passport.serializeUser((user, done) => {
    console.log(user);
    done(null, user)
});
passport.deserializeUser((obj, done) => done(null, obj));


app.get('/', (req, res) => {
    res.send(`
        <h1>Server ID: ${SERVER_ID}</h1>
        <a href="/auth/login">Login with OAuth2</a>
    `);
});

// Login route
app.get('/auth/login', passport.authenticate('oauth2'));

// Callback route
app.get('/auth/callback', 
    passport.authenticate('oauth2', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/profile');
    }
);

// Profile page (protected)
app.get('/profile', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.send(`
        <h1>Logged In: ${SERVER_ID}</h1>
        <p>Access Token: ${req.user.accessToken}</p>
        <pre>${JSON.stringify(req.user, null, 2)}</pre>
        <a href="/logout">Logout</a>
    `);
});

// Logout route
app.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy();
        res.redirect('/');
    });
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
