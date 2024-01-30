const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const mysql = require('mysql2/promise');
const flash = require('express-flash');
const session = require('express-session');

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'anne-marketplace',
    resave: false,
    saveUninitialized: true
}));

app.use(flash());





// Inicialização do Passport.js
app.use(passport.initialize());
app.use(passport.session());

// Rota para fazer logout
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Erro ao fazer logout:', err);
            return res.status(500).send('Erro ao fazer logout');
        }
        res.redirect('/login'); // Redireciona para a página de login
    });
});

// Configuração da estratégia de autenticação local
passport.use(new LocalStrategy(
    async (username, password, done) => {
        try {
            // Busca o usuário no banco de dados pelo nome de usuário
            const [user] = await executeQuery('SELECT * FROM users WHERE username = ?', [username]);

            // Se o usuário não for encontrado ou a senha estiver incorreta, retorna uma mensagem de erro
            if (!user || user.password !== password) {
                return done(null, false, { message: 'Nome de usuário ou senha incorretos.' });
            }

            // Se o usuário for encontrado e a senha estiver correta, retorna o usuário
            return done(null, user);
        } catch (error) {
            // Se ocorrer um erro ao buscar o usuário, retorna o erro
            return done(error);
        }
    }
));

// Serialização do usuário para a sessão
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Desserialização do usuário da sessão
passport.deserializeUser(async (id, done) => {
    try {
        // Busca o usuário no banco de dados pelo ID
        const [user] = await executeQuery('SELECT * FROM users WHERE id = ?', [id]);
        
        // Se o usuário for encontrado, retorna o usuário
        done(null, user);
    } catch (error) {
        // Se ocorrer um erro ao buscar o usuário, retorna o erro
        done(error);
    }
});


// Rota de login
app.post('/login', passport.authenticate('local', {
    successRedirect: '/products',
    failureRedirect: '/login',
    failureFlash: true
}));

// Rota para renderizar o formulário de login
app.get('/login', (req, res) => {
    // Renderiza o arquivo login.ejs
    res.render('login', { message: req.flash('error') });
});


// Rota para renderizar o formulário de cadastro de usuário
app.get('/register', (req, res) => {
    res.render('register', { message: req.flash('error') });
});

// Rota para processar o formulário de cadastro de usuário
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Verifica se o usuário já existe no banco de dados
        const existingUser = await executeQuery('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser.length > 0) {
            req.flash('error', 'Nome de usuário já existe');
            return res.redirect('/register');
        }

        // Insere o novo usuário no banco de dados com roles_id padrão (1)
        await executeQuery('INSERT INTO users (username, password, roles_id) VALUES (?, ?, 1)', [username, password]);
        
        req.flash('success', 'Usuário cadastrado com sucesso!');
        res.redirect('/login'); // Redireciona para a página de login após o cadastro
    } catch (error) {
        console.error('Erro ao cadastrar usuário:', error);
        res.status(500).send('Erro ao cadastrar usuário');
    }
});


// Middleware para verificar autenticação
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

async function executeQuery(sql, values = []) {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'anne'
    });

    try {
        const [rows] = await connection.execute(sql, values);
        return rows;
    } catch (error) {
        console.error('Erro ao executar consulta SQL:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

app.get('/products', isAuthenticated, async (req, res) => {
    try {
        const products = await executeQuery('SELECT * FROM products');
        const successMessage = req.flash('success'); 
        res.render('products/index', { pageTitle: 'Produtos', products, successMessage, username: req.user.username });

    } catch (error) {
        res.status(500).send('Erro ao buscar produtos');
    }
});

app.get('/products/new', isAuthenticated, (req, res) => {
    res.render('products/new', { pageTitle: 'Inserir Produto' , username: req.user.username });
});

app.post('/products', async (req, res) => {
    const { name, price } = req.body;
    const userId = req.session.passport.user; 

    if (!userId) {
        return res.status(401).send('Usuário não autenticado');
    }

    try {
        await executeQuery('INSERT INTO products (name, price, users_id) VALUES (?, ?, ?)', [name, price, userId]);
        req.flash('success', 'Produto cadastrado com sucesso!');
        res.redirect('/products');
    } catch (error) {
        console.error('Erro ao cadastrar produto:', error);
        res.status(500).send('Erro ao cadastrar produto');
    }
});

app.delete('/products/:id', isAuthenticated, async (req, res) => {
    const productId = req.params.id;
    try {
        await executeQuery('DELETE FROM products WHERE id = ?', [productId]);
        res.status(200).json({ message: 'Produto excluído com sucesso!' });
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        res.status(500).json({ error: 'Erro ao excluir produto' });
    }
});

app.get('/products/:id/edit', isAuthenticated, async (req, res) => {
    const productId = req.params.id;
    try {
        const [product] = await executeQuery('SELECT * FROM products WHERE id = ?', [productId]);
        res.render('products/edit', { pageTitle: 'Editar Produto', product, username: req.user.username });
    } catch (error) {
        res.status(500).send('Erro ao buscar produto para edição');
    }
});

app.post('/products/:id', async (req, res) => {
    const productId = req.params.id;
    const { name, price } = req.body;
    try {
        await executeQuery('UPDATE products SET name = ?, price = ? WHERE id = ?', [name, price, productId]);
        req.flash('success', 'Produto atualizado com sucesso!');
        res.redirect('/products');
    } catch (error) {
        res.status(500).send('Erro ao atualizar produto');
    }
});



app.listen(PORT, () => {
    console.log(`O servidor está em execução http://localhost:${PORT}`);
});
