const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// 确保上传目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// 配置multer用于文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // 保留原始文件名，添加时间戳避免重名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('只允许上传PDF文件'), false);
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB限制
    }
});

// 中间件
app.use(express.json());
app.use(express.static('public')); // 静态文件目录
app.use('/pdfs', express.static('uploads')); // PDF文件访问路径

// 存储PDF文件信息的简单数据库
const pdfDatabase = {
    exercise: [],
    math: []
};

// 从文件加载数据库
function loadDatabase() {
    try {
        if (fs.existsSync('database.json')) {
            const data = fs.readFileSync('database.json', 'utf8');
            Object.assign(pdfDatabase, JSON.parse(data));
        }
    } catch (error) {
        console.log('创建新的数据库文件');
    }
}

// 保存数据库到文件
function saveDatabase() {
    fs.writeFileSync('database.json', JSON.stringify(pdfDatabase, null, 2));
}

// 路由

// 获取所有PDF文件
app.get('/api/pdfs', (req, res) => {
    res.json(pdfDatabase);
});

// 上传PDF文件
app.post('/api/upload', upload.single('pdf'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有选择文件' });
        }

        const { category, filename } = req.body;
        const fileInfo = {
            id: Date.now().toString(),
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            category: category || 'exercise',
            displayName: filename || req.file.originalname.replace('.pdf', ''),
            uploadDate: new Date().toLocaleString('zh-CN'),
            size: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB',
            downloadUrl: `/pdfs/${req.file.filename}`
        };

        // 添加到对应分类
        if (pdfDatabase[fileInfo.category]) {
            pdfDatabase[fileInfo.category].push(fileInfo);
        } else {
            pdfDatabase[fileInfo.category] = [fileInfo];
        }

        saveDatabase();
        res.json({ 
            success: true, 
            message: '文件上传成功',
            file: fileInfo
        });

    } catch (error) {
        res.status(500).json({ error: '上传失败: ' + error.message });
    }
});

// 删除PDF文件
app.delete('/api/delete/:id', (req, res) => {
    try {
        const { id } = req.params;
        let fileDeleted = false;
        let filePath = '';

        // 在所有分类中查找并删除文件
        Object.keys(pdfDatabase).forEach(category => {
            const index = pdfDatabase[category].findIndex(file => file.id === id);
            if (index !== -1) {
                filePath = pdfDatabase[category][index].path;
                pdfDatabase[category].splice(index, 1);
                fileDeleted = true;
            }
        });

        if (fileDeleted) {
            // 删除物理文件
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            saveDatabase();
            res.json({ success: true, message: '文件删除成功' });
        } else {
            res.status(404).json({ error: '文件未找到' });
        }
    } catch (error) {
        res.status(500).json({ error: '删除失败: ' + error.message });
    }
});

// 启动服务器
app.listen(PORT, () => {
    loadDatabase();
    console.log(`PDF共享服务器运行在 http://localhost:${PORT}`);
    console.log(`上传目录: ${uploadsDir}`);
});