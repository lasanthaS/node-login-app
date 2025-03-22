require('dotenv').config();

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const qs = require('qs');
const logging = require('./middleware/logging');

const app = express();
const PORT = 3001;
const SERVER_ID = uuidv4();

logging.info(`starting server: ${SERVER_ID}`);

const dbPoolConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: {
        require: true, 
        rejectUnauthorized: false
    },
};

const pool = new Pool(dbPoolConfig);

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session',
        pruneSessionInterval: 3600,
        debug: console.log,
    }),
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure:false,
        maxAge: 60 * 60 * 1000
    },
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

const exchangeToken = async (token) => {
    try {
        const response = await axios.post(
            'https://sts.preview-dv.choreo.dev/oauth2/token', 
            qs.stringify({
                client_id: 'choreodevportal',
                grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
                requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
                scope: 'apim:admin apim:subscribe environments:view_prod environments:view_dev apim:prod_key_manage apim:sand_key_manage urn:choreosystem:customdomainapi:custom_domain_view urn:choreosystem:usermanagement:user_view',
                subject_token: token,
                orgHandle: 'lasanthasamarakoon',
            }), 
            {
                headers: {
                    'Referer': '',
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('Token exchange failed:', error.response ? error.response.data : error.message);
        throw new Error('Failed to exchange token');
    }
}


// Configure OAuth2 strategy
passport.use(new OAuth2Strategy({
    name: 'Asgardeo',
    issuer: process.env.OAUTH2_ISSUER,
    authorizationURL: process.env.OAUTH2_AUTHORIZATION_ENDPOINT,
    tokenURL: process.env.OAUTH2_TOKEN_ENDPOINT,
    userInfoURL: process.env.OAUTH2_USERINFO_ENDPOINT,
    clientID: process.env.OAUTH2_CLIENT_ID,
    callbackURL: process.env.OAUTH2_REDIRECT_URI,
    pkce: true,
    state: true,
    // signUpURL: '',
    logoutURL: process.env.OAUTH2_LOGOUT_ENDPOINT,
    logoutRedirectURI: process.env.OAUTH2_POST_LOGOUT_REDIRECT_URI,
    certificate: '',
    jwksURL: process.env.OAUTH2_JWKS_ENDPOINT,
    scope: ['openid', 'profile', 'email'],
  }, async (accessToken, refreshToken, params, profile, done) => {
    // Store user info (Here, just storing accessToken for simplicity)
    logging.infoSection('verify callback');

    if (!accessToken) {
        logging.info('Access token is null');
        return done(null, false, { message: 'Invalid credentials' });
    }
    logging.info('Access token: ' + accessToken);

    // exchange token
    const exchangedToken = await exchangeToken(accessToken);

    const decodedExchangedToken = jwt.decode(exchangedToken);
    const decodedIdToken = jwt.decode(params.id_token);
    const decodedAccessToken = jwt.decode(accessToken);

    const organizations = decodedExchangedToken.organizations;

    const firstName = decodedIdToken.given_name || decodedAccessToken.nickname;
    const lastName = decodedIdToken.family_name;
    const email = decodedIdToken.email;

    // profile = {
    //     id: decodedIdToken.sub,
    //     email,
    //     firstName,
    //     lastName,
    //     organizations,
    //     accessToken,
    //     exchangedToken,
    // };

    profile = {
        accessToken,
        exchangedToken,
        organizations,
        email,
        firstName,
        lastName,
        serverId: SERVER_ID,
    };

    logging.info('verfiy callback done');
    return done(null, profile);
}));

// Serialize & deserialize user
passport.serializeUser((user, done) => {
    logging.infoSection('serializeUser');
    logging.info('User: ' + JSON.stringify(user, null, 2));
    done(null, user)
});
passport.deserializeUser((obj, done) => {
    logging.infoSection('deserializeUser');
    done(null, obj)
});

app.get('/', (req, res) => {
    res.send(`
        <h1>Server ID: ${SERVER_ID}</h1>
        <a href="/login">Login with OAuth2</a>
    `);
});

const login = async (req, res, next) => {
    logging.infoSection('login');
    // await configPassport(); // this is not necessary as there are no org specific idps
    await req.session.save(async (err) => {
        logging.infoSection('session save');
        if (err) {
            logging.error('Session save failed');
            return res.status(500).send('Internal Server Error');
        }
        await passport.authenticate('oauth2')(req, res, next);
    });
    logging.info('login done');
}

// Login route
app.get('/login', login);

// Callback route
app.get('/signin', 
    passport.authenticate('oauth2', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/profile');
    }
);

// Profile page (protected)
app.get('/profile', (req, res) => {
    logging.infoSection('profile');
    if (!req.isAuthenticated()) {
        logging.info('Profile - Not authenticated')
        return res.redirect('/');
    }
    logging.info('Profile - Authenticated');
    res.send(`
        <h1>Logged In: ${SERVER_ID}</h1>
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
